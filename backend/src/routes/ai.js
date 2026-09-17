import express from 'express';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { ok, asyncHandler } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { getCatalog, invalidateCatalog } from '../ai/catalog.js';
import { aiConfig, parseModelId } from '../ai/config.js';
import { runAgent } from '../ai/agent.js';
import { createNdjsonStream } from '../ai/stream.js';
import { acquireSlot, checkUserQuota, gateStatus } from '../ai/limits.js';
import { describeCapabilities } from '../ai/prompt.js';
import { gpuSnapshot } from '../ai/gpu.js';
import * as ollama from '../ai/provider/ollama.js';

const router = express.Router();

/** 历史最多带多少条 —— 再多会顶穿 num_ctx，而且模型也用不上那么早的上下文 */
const MAX_HISTORY = 10;
const MAX_CONTENT_CHARS = 2000;

/**
 * GET /api/ai/models
 * 未登录也能看（前端要先渲染下拉再谈登录），但**不能管理**。
 */
router.get('/models', auth(false), asyncHandler(async (req, res) => {
  const catalog = await getCatalog({ refresh: req.query.refresh === '1' });
  return ok(res, {
    groups: catalog.groups,
    defaultModel: catalog.defaultModel,
    capabilities: describeCapabilities(req.user?.role, req.query.lang),
    // 前端据此决定要不要显示"语音输入"按钮
    gate: gateStatus()
  });
}));

/**
 * POST /api/ai/chat
 * NDJSON 流式对话。
 *
 * ⚠️ 这个 handler 里**绝不能 next(err)**：res.flushHeaders() 一旦调用，
 * app.js 末尾的全局错误中间件就再也写不了响应（ERR_HTTP_HEADERS_SENT，
 * 客户端那边表现为连接被掐断、只有一个转圈）。所有异常必须在这里捕获，
 * 以一条 {type:'error'} 事件的形式发出去，然后正常 end()。
 */
router.post('/chat', auth(), asyncHandler(async (req, res) => {
  const { model, messages, lang } = req.body || {};

  if (!model) throw new HttpError(400, '缺少 model 参数');
  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, 'messages 不能为空');

  // 校验模型确实在目录里，避免把任意字符串透传给上游
  const catalog = await getCatalog();
  if (!catalog.models.some((m) => m.id === model)) {
    throw new HttpError(400, `未知的模型：${model}`);
  }

  // 限流放在建流之前，这样 429 还是一个正常的 JSON 响应，前端好处理
  checkUserQuota(req.user.id);

  const history = sanitizeHistory(messages);
  if (!history.length) throw new HttpError(400, 'messages 里没有有效内容');

  const stream = createNdjsonStream(res);
  const controller = new AbortController();
  stream.onClientClose(() => controller.abort());

  let release = null;
  let lastError = null;

  try {
    // 全局并发闸门：队满会抛 503，这里已经建流了，所以用事件发出去
    try {
      release = await acquireSlot();
    } catch (e) {
      stream.write({ type: 'error', message: e.message, code: e.status || 503 });
      stream.close();
      return;
    }

    stream.write({ type: 'start', model, lang: lang || 'zh-CN' });

    for await (const ev of runAgent({
      modelId: model,
      history,
      user: req.user,
      lang: lang || 'zh-CN',
      signal: controller.signal
    })) {
      if (stream.closed) break; // 用户点了停止/关了页面，别再往下算了
      stream.write(ev);
    }
  } catch (e) {
    lastError = e;
    if (e.name !== 'AbortError') {
      console.error('[ai] 对话失败：', e.message);
      stream.write({
        type: 'error',
        message: friendlyError(e, model),
        code: e.status || 500
      });
    }
  } finally {
    release?.();
    stream.close();
    if (lastError && lastError.name !== 'AbortError') {
      // 已经写进流里了，这里只留个服务端日志便于排查
      console.warn('[ai] 本轮以错误结束：%s', lastError.message);
    }
  }
}));

/** 把上游各种错误翻译成用户能看懂、且知道下一步该做什么的话 */
function friendlyError(e, modelId) {
  const { provider } = parseModelId(modelId || '');
  const msg = String(e.message || '');
  if (/ECONNREFUSED|连不上 Ollama/.test(msg)) {
    return '连不上本机的 Ollama 服务，请确认 Ollama 正在运行。';
  }
  if (e.status === 401 || /401/.test(msg)) {
    return '模型鉴权失败，请检查对应的 API Key 配置。';
  }
  if (e.status === 429 || /429/.test(msg)) {
    return '模型服务限流了，请稍后再试。';
  }
  if (/context length|too long|num_ctx/i.test(msg)) {
    return '对话太长了，超出了模型的上下文限制。请清空会话重新开始。';
  }
  if (provider === 'ollama' && /not found|no such model/i.test(msg)) {
    return '这个模型在本机不存在，可能已经被删除了。';
  }
  return msg.slice(0, 300) || '助手出错了，请稍后再试。';
}

/**
 * 清洗前端传来的历史。
 * 只保留 user/assistant 两种角色——**前端传来的 tool / system 消息一律丢弃**，
 * 否则调用方可以伪造一条 system 消息来改写规则（提示注入）。
 */
function sanitizeHistory(messages) {
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .filter((m) => typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_CONTENT_CHARS)
    }));
}

/**
 * GET /api/ai/status — 管理台看当前显存/加载情况
 * 这块 3090 是与其它项目共用的，加载模型前必须先看这里。
 */
router.get('/status', auth(), allow('admin'), asyncHandler(async (_req, res) => {
  let running = [];
  let error = '';
  try {
    running = await ollama.listRunning();
  } catch (e) {
    error = e.message;
  }
  // 显存快照与 Ollama 状态互相独立：Ollama 挂了也要能看到是谁在占着 GPU
  const gpu = await gpuSnapshot();
  return ok(res, {
    gate: gateStatus(),
    numCtx: aiConfig.numCtx,
    keepAlive: aiConfig.keepAlive,
    running,
    error,
    gpu
  });
}));

/**
 * POST /api/ai/models/:name/load — 预加载（把十几秒冷启动挪到点按钮的时候）
 * CORS 上 model 名带冒号（qwen3:14b）没问题，Express 路径参数按段解析。
 */
router.post('/models/:name/load', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const name = req.params.name;
  await ollama.loadModel(name);
  invalidateCatalog();
  return ok(res, { model: name, loaded: true });
}));

router.post('/models/:name/unload', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const name = req.params.name;
  await ollama.unloadModel(name);
  invalidateCatalog();
  return ok(res, { model: name, loaded: false });
}));

export default router;
