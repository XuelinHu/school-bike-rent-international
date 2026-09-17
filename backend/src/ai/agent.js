/**
 * 多轮 tool-calling 循环。**provider 无关** —— 只认 canonical 消息/事件。
 *
 * 一轮的形状：
 *   provider 流 → 边吐 text 边攒 tool_call → 有工具就执行 → 结果作为 role:'tool' 回灌 → 再来一轮
 *   没有工具调用就结束。
 *
 * ── 这个文件里防的几件事（都是实测踩过的）──────────────────────
 *   1. **最后一轮不给工具**：maxToolRounds 到了还带着工具，模型会一直查下去不收敛。
 *      最后一轮传 tools: [] 强制它用已有信息作答。
 *   2. **同名同参去重**：14B 有时会在一次回答里把同一个查询发两遍，白等一轮。
 *   3. **回灌顺序**：assistant(tool_calls) 必须紧跟着与之配对的 role:'tool' 消息；
 *      数量对不上就**整对丢弃**，而不是留半截——半截序列会让后续所有轮次开始复读。
 *   4. **"只说不做"退化**：模型把该调用的工具写在正文里却没真调用（见 base.js）。
 *      这种文本会作为答案直接吐给用户，必须拦掉。
 */
import { streamChat, supportsTools } from './registry.js';
import { aiConfig } from './config.js';
import { buildSystemMessages } from './prompt.js';
import { executeTool, toolsForRole } from './tools/index.js';
import { looksLikeRawToolCall } from './provider/base.js';

/** 工具结果回灌给模型前截断：一条工具能返回几百行，全塞进去会挤爆 num_ctx */
const MAX_TOOL_CHARS = 2000;
const MAX_TOOL_LINES = 10;

function truncateForModel(text) {
  let out = String(text);
  const lines = out.split('\n');
  let clipped = false;
  if (lines.length > MAX_TOOL_LINES) {
    out = lines.slice(0, MAX_TOOL_LINES).join('\n');
    clipped = true;
  }
  if (out.length > MAX_TOOL_CHARS) {
    out = out.slice(0, MAX_TOOL_CHARS);
    clipped = true;
  }
  return clipped ? `${out}\n…（结果过长已截断）` : out;
}

/**
 * 跑一轮完整对话。
 *
 * @param {object} opts
 * @param {string} opts.modelId   canonical 模型 id（provider:model）
 * @param {Array}  opts.history   canonical 消息（不含 system），已由路由层裁剪
 * @param {object} opts.user      { id, username, role }
 * @param {string} opts.lang      'zh-CN' | 'en-US'
 * @param {AbortSignal} opts.signal
 * @yields canonical 事件（在 provider 事件基础上增加 tool_result / notice / reset）
 */
export async function* runAgent({ modelId, history, user, lang, signal }) {
  const toolDefs = supportsTools(modelId) ? toolsForRole(user?.role) : [];
  const system = await buildSystemMessages({ lang, user, tools: toolDefs });

  // 预算：system + 历史 + 每轮工具往返。历史由路由层裁到最近若干条，这里不再二次裁剪。
  const convo = [...system, ...history];

  const ctx = { user, lang };
  /** 本轮之前已经执行过的调用，用于同名同参去重 */
  const seenCalls = new Map();
  let totalRounds = 0;

  for (let round = 0; round < aiConfig.maxToolRounds; round += 1) {
    totalRounds = round + 1;
    // 见文件头注释第 1 条
    const isLastRound = round === aiConfig.maxToolRounds - 1;
    const roundTools = isLastRound ? [] : toolDefs;

    if (isLastRound && toolDefs.length) {
      yield {
        type: 'notice',
        code: 'final_round',
        message: lang === 'en-US' ? 'Wrapping up with what I have.' : '我用手头的信息来回答。'
      };
    }

    let roundText = '';
    const calls = [];
    let doneReason = 'stop';

    for await (const ev of streamChat({ modelId, messages: convo, tools: roundTools, signal })) {
      if (ev.type === 'text') {
        roundText += ev.text;
        yield ev;
      } else if (ev.type === 'thinking') {
        yield ev;
      } else if (ev.type === 'tool_call') {
        calls.push(ev);
      } else if (ev.type === 'done') {
        doneReason = ev.reason;
        if (ev.usage) yield { type: 'usage', usage: ev.usage, round: totalRounds };
      } else if (ev.type === 'error') {
        yield ev;
      }
    }

    // 见文件头注释第 4 条：这轮没有任何工具调用，但正文里写着工具调用语法 —— 判为退化
    if (!calls.length && looksLikeRawToolCall(roundText)) {
      console.warn('[ai] 检测到"只说不做"退化，丢弃该轮文本。model=%s', modelId);
      // 让前端把这轮已经流式显示出去的字符清掉，否则用户会看到一段"我要调用查询工具"
      yield { type: 'reset' };
      yield {
        type: 'text',
        text: lang === 'en-US'
          ? 'Sorry, I got a bit tangled up there. Could you ask that again?'
          : '抱歉，我这边没组织好，麻烦你再问一次。'
      };
      yield { type: 'done', reason: 'degenerate', rounds: totalRounds };
      return;
    }

    if (!calls.length) {
      yield { type: 'done', reason: doneReason, rounds: totalRounds };
      return;
    }

    // ── 执行工具 ──
    // 见文件头注释第 3 条：assistant 消息必须先入列，后面紧跟配对 tool 消息
    const assistantMsg = { role: 'assistant', content: roundText, toolCalls: calls };
    const toolMsgs = [];

    for (const call of calls) {
      const key = `${call.name}:${JSON.stringify(call.arguments || {})}`;

      let result;
      if (seenCalls.has(key)) {
        // 见文件头注释第 2 条：同一轮里重复的调用直接复用结果，不再打一次库
        result = seenCalls.get(key);
      } else {
        yield { type: 'tool_call', id: call.id, name: call.name, arguments: call.arguments };
        result = await executeTool(call.name, call.arguments, ctx);
        seenCalls.set(key, result);
      }

      const payload = result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error };

      yield {
        type: 'tool_result',
        id: call.id,
        name: call.name,
        ok: result.ok,
        // 只给前端一个摘要用于展示"查到了什么"，完整数据留在服务端
        preview: result.ok ? (result.summary || '') : result.error
      };

      toolMsgs.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: truncateForModel(JSON.stringify(payload))
      });
    }

    // 见文件头注释第 3 条：配对数量对不上就整对丢弃，绝不留半截
    if (toolMsgs.length === calls.length && toolMsgs.length > 0) {
      convo.push(assistantMsg, ...toolMsgs);
    } else {
      console.warn('[ai] 工具回灌配对失败，整对丢弃。calls=%d msgs=%d', calls.length, toolMsgs.length);
      yield { type: 'done', reason: 'pairing_failed', rounds: totalRounds };
      return;
    }
  }

  // 理论上到不了这里（最后一轮不给工具，必然收敛）。真到了说明模型在无工具时还在要工具。
  yield {
    type: 'notice',
    code: 'max_rounds',
    message: lang === 'en-US' ? 'I have reached my lookup limit.' : '查询次数已达上限。'
  };
  yield { type: 'done', reason: 'max_rounds', rounds: totalRounds };
}
