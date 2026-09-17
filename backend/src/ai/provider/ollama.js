/**
 * Ollama 原生 /api/chat 适配器（NDJSON 流）。
 *
 * 为什么用原生协议而不是它的 OpenAI 兼容层：
 *   1) 能拿到 `done_reason`、`eval_count` 这些真实状态，判断"是停了还是被截断"
 *   2) `think: false` 与 `keep_alive` 是原生参数，兼容层不透传
 *   3) 少一层格式转换，流式分片和上游一一对应，出错时好定位
 *
 * ── qwen3 + 工具调用 的坑（都在这一个文件里收口）────────────────
 *   1. **必须显式传 think:false**。不传就进思考模式，首 token 延迟和 token 消耗翻倍，
 *      而且第一个 tool_call 常被推到几百 token 之后。
 *   2. **"只说不做"退化**：模型在思考里写"我应该调用某工具"却没落到 tool_calls，
 *      这段原文会被当答案吐给用户 → 见 looksLikeRawToolCall。
 *   3. **回灌顺序**：assistant(tool_calls) 必须与后续 role:'tool' 消息配对，
 *      不合法就整对丢弃（在 agent.js 里做，这里只负责如实转换）。
 */
import { aiConfig } from '../config.js';
import {
  ProviderError, toProviderError, normalizeToolDef, parseToolArguments, stripThinking
} from './base.js';

/** canonical 消息 → Ollama 消息 */
export function toOllamaMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content ?? '', ...(m.name ? { tool_name: m.name } : {}) };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.toolCalls.map((tc) => ({
          function: { name: tc.name, arguments: tc.arguments || {} }
        }))
      };
    }
    return { role: m.role, content: m.content ?? '' };
  });
}

/**
 * 上游卡死时的统一报错。用户看到的必须是一句能照做的话，而不是一个永远转的圈。
 */
function stalledError(model, ms) {
  return new ProviderError(
    `模型 ${model} 超过 ${Math.round(ms / 1000)} 秒没有响应。` +
    '常见原因：显存不足导致模型加载卡住（这台机器的 GPU 是多项目共用的），或模型正在冷启动。',
    { retryable: true }
  );
}

/**
 * 带空闲超时的 read()——管的是**响应头之后**的每一片数据。
 *
 * 上游卡住时必须主动放弃。没有这层保护，客户端只会看到一个永远转的圈：
 * 连接没断、心跳照发，用户完全无法区分"模型在思考"和"已经死了"。
 */
function readWithIdleTimeout(reader, ms, model) {
  let timer;
  return Promise.race([
    reader.read(),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(stalledError(model, ms)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/**
 * 带超时的 fetch，管的是**响应头到达之前**那段。
 *
 * ⚠️ 这段单独处理是必须的：Ollama 在模型没加载完之前**根本不发响应头**。
 * 所以"模型加载卡死"时，代码是停在 `await fetch(...)` 上的，压根进不了读循环——
 * 只在读循环里加空闲超时是**拦不住**的（这是实测踩出来的：85 秒过去了一个 error 事件都没有）。
 *
 * 超时用独立的 AbortController，**不能**把它并进调用方的 signal 后就不管了：
 * 那样计时器会在这个长连接上一直挂着，把正常的长回答也一起掐断。
 * 头部一到就 clearTimeout，之后这个 controller 再也不会 abort。
 */
async function fetchWithHeaderTimeout(url, init, { model, signal, ms }) {
  const header = new AbortController();
  const timer = setTimeout(() => header.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, header.signal]) : header.signal
    });
  } catch (e) {
    // 调用方主动取消（点了停止/关了页面）要原样抛出，不能伪装成超时
    if (signal?.aborted) throw e;
    if (header.signal.aborted) throw stalledError(model, ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** canonical 工具定义 → Ollama tools */
export function toOllamaTools(tools) {
  return (tools || []).map((t) => {
    const def = normalizeToolDef(t);
    return { type: 'function', function: def };
  });
}

/**
 * 流式对话。返回一个 async generator，逐条吐 canonical 事件。
 *
 * @param {object} opts
 * @param {string} opts.model      裸模型名，如 'qwen3:14b'（**不含** provider 前缀）
 * @param {Array}  opts.messages   canonical 消息
 * @param {Array}  [opts.tools]    canonical 工具定义
 * @param {AbortSignal} [opts.signal]
 */
export async function* streamChat({ model, messages, tools, signal }) {
  const options = { num_predict: aiConfig.maxTokens };
  // ⚠️ 只在显式配置时才发 num_ctx。它不是采样参数而是**加载参数**：
  // 值一旦与常驻实例不同，Ollama 就卸载重载整个模型；显存不够时重载会永久卡住，
  // 表现为"心跳一直在发、第一个 token 永远不来"。详见 config.js 里 numCtx 的说明。
  if (aiConfig.numCtx > 0) options.num_ctx = aiConfig.numCtx;

  const body = {
    model,
    messages: toOllamaMessages(messages),
    stream: true,
    // 见文件头注释第 1 条：不显式关掉思考模式，首 token 会慢得离谱
    think: false,
    keep_alive: aiConfig.keepAlive,
    options
  };
  if (tools?.length) body.tools = toOllamaTools(tools);

  let response;
  try {
    response = await fetchWithHeaderTimeout(`${aiConfig.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, { model, signal, ms: aiConfig.requestTimeoutMs });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    // 上面已经翻译过的（比如加载超时）别再包一层，否则用户会看到两句叠在一起的话
    if (e instanceof ProviderError) throw e;
    // 连不上 Ollama 是最常见的故障，给出可操作的提示而不是一个光秃秃的 fetch failed
    throw new ProviderError(`连不上 Ollama（${aiConfig.ollamaBaseUrl}）：${e.message}`, { retryable: true });
  }

  if (!response.ok) throw await toProviderError(response, 'Ollama');

  const reader = response.body.getReader();
  // ⚠️ 必须带 {stream:true}，否则中文按字节切块会偶发乱码
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let sawToolCall = false;

  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout(reader, aiConfig.idleTimeoutMs, model);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // NDJSON：一行一个 JSON。最后一行可能不完整，留在 buffer 里等下一个 chunk
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;

        let chunk;
        try {
          chunk = JSON.parse(line);
        } catch {
          continue; // 半行/坏行直接跳过，不要中断整个流
        }

        if (chunk.error) throw new ProviderError(`Ollama 报错：${chunk.error}`);

        const msg = chunk.message || {};
        if (msg.thinking) yield { type: 'thinking', text: msg.thinking };

        const text = stripThinking(msg.content || '');
        if (text) {
          // 见文件头注释第 2 条：把"只说不做"的原文挡在会话之外
          if (!msg.tool_calls?.length) {
            yield { type: 'text', text };
          }
        }

        if (msg.tool_calls?.length) {
          sawToolCall = true;
          for (const tc of msg.tool_calls) {
            const fn = tc.function || {};
            yield {
              type: 'tool_call',
              // Ollama 原生不给 id，自己造一个稳定的，agent 回灌时要用它配对
              id: tc.id || `call_${fn.name}_${Math.random().toString(36).slice(2, 8)}`,
              name: fn.name,
              // 见 base.js：Ollama 这里已经是对象，仍统一走一遍以防模型给了字符串
              arguments: parseToolArguments(fn.arguments)
            };
          }
        }

        if (chunk.done) {
          yield {
            type: 'done',
            reason: chunk.done_reason || (sawToolCall ? 'tool_calls' : 'stop'),
            usage: {
              promptTokens: chunk.prompt_eval_count ?? null,
              completionTokens: chunk.eval_count ?? null
            }
          };
          return;
        }
      }
    }
    // 流正常结束但没收到 done —— 多半是被上游掐了
    yield { type: 'done', reason: 'eof', usage: {} };
  } finally {
    // 提前 return / 抛异常时把上游连接放掉，否则 Ollama 会一直占着那个槽位
    try { await reader.cancel(); } catch { /* 已经关了 */ }
  }
}

/** 列出本机已下载的模型 */
export async function listModels({ signal } = {}) {
  const response = await fetch(`${aiConfig.ollamaBaseUrl}/api/tags`, { signal });
  if (!response.ok) throw await toProviderError(response, 'Ollama /api/tags');
  const data = await response.json();
  return (data.models || []).map((m) => ({
    name: m.name,
    sizeBytes: m.size ?? null,
    parameterSize: m.details?.parameter_size || '',
    quantization: m.details?.quantization_level || '',
    family: m.details?.family || '',
    modifiedAt: m.modified_at || null
  }));
}

/** 当前已加载进显存的模型（含显存占用） */
export async function listRunning({ signal } = {}) {
  const response = await fetch(`${aiConfig.ollamaBaseUrl}/api/ps`, { signal });
  if (!response.ok) throw await toProviderError(response, 'Ollama /api/ps');
  const data = await response.json();
  return (data.models || []).map((m) => ({
    name: m.name,
    sizeVram: m.size_vram ?? null,
    sizeBytes: m.size ?? null,
    contextLength: m.context_length ?? null,
    expiresAt: m.expires_at || null
  }));
}

/**
 * 预加载模型（把冷启动的十几秒挪到用户点"加载"的时候）。
 * 传空 prompt 只是为了让 Ollama 把权重读进显存，不产生实际推理。
 */
export async function loadModel(model, { signal } = {}) {
  const response = await fetch(`${aiConfig.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', keep_alive: aiConfig.keepAlive, stream: false }),
    signal
  });
  if (!response.ok) throw await toProviderError(response, 'Ollama /api/generate');
  return true;
}

/** 卸载模型：keep_alive:0 让 Ollama 立刻把它从显存里赶出去 */
export async function unloadModel(model, { signal } = {}) {
  const response = await fetch(`${aiConfig.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, keep_alive: 0, stream: false }),
    signal
  });
  if (!response.ok) throw await toProviderError(response, 'Ollama /api/generate');
  return true;
}
