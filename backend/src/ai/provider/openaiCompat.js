/**
 * OpenAI 兼容适配器（SSE 流）。DeepSeek / 阿里百炼 / OpenAI 三家共用这一个。
 *
 * 与 Ollama 的差异，全在这个文件里抹平：
 *   1) **arguments 是 JSON 字符串**，而且流式下跨多个 chunk 分片到达（要按 index 拼）
 *   2) tool_call 的 id 由上游给，且第一片才带 id/name，后续片只有 arguments 增量
 *   3) 终止符是字面量 `data: [DONE]`，不是 JSON
 *   4) 用量在最后一个 chunk 的 `usage` 字段（要显式开 stream_options.include_usage）
 */
import { aiConfig } from '../config.js';
import {
  ProviderError, toProviderError, normalizeToolDef, parseToolArguments, stripThinking
} from './base.js';

/** canonical 消息 → OpenAI 消息 */
export function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      // OpenAI 靠 tool_call_id 配对，而不是靠顺序
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content ?? '' };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          // 见文件头注释第 1 条：这家要的是字符串
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) }
        }))
      };
    }
    return { role: m.role, content: m.content ?? '' };
  });
}

/** canonical 工具定义 → OpenAI tools */
export function toOpenAITools(tools) {
  return (tools || []).map((t) => {
    const def = normalizeToolDef(t);
    return { type: 'function', function: def };
  });
}

/**
 * 流式对话，逐条吐 canonical 事件。
 * @param {object} opts
 * @param {string} opts.baseUrl 形如 https://api.deepseek.com（不含 /v1，这里补）
 * @param {string} opts.apiKey
 * @param {string} opts.model   裸模型名
 */
export async function* streamChat({ baseUrl, apiKey, model, messages, tools, signal }) {
  const body = {
    model,
    messages: toOpenAIMessages(messages),
    stream: true,
    // 见文件头注释第 4 条：不开这个，流式响应里根本不带 usage
    stream_options: { include_usage: true },
    max_tokens: aiConfig.maxTokens
  };
  if (tools?.length) {
    body.tools = toOpenAITools(tools);
    body.tool_choice = 'auto';
  }

  // 各家的路径不都是 /v1，baseUrl 已经带了就不要再补
  const url = /\/v\d+$/.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  let response;
  // 云厂商一般秒回响应头，但网关抽风时同样会一直挂着 —— 和 ollama.js 一样，
  // 头部阶段必须自带超时，否则客户端看到一个永远转的圈。
  const header = new AbortController();
  const timer = setTimeout(() => header.abort(), aiConfig.requestTimeoutMs);
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, header.signal]) : header.signal
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (header.signal.aborted) {
      throw new ProviderError(
        `${model} 超过 ${Math.round(aiConfig.requestTimeoutMs / 1000)} 秒没有响应，请稍后再试。`,
        { retryable: true }
      );
    }
    if (e.name === 'AbortError') throw e;
    throw new ProviderError(`连不上 ${baseUrl}：${e.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const err = await toProviderError(response, model);
    // 401 很常见（key 过期/填错），给一句能直接照做的提示
    if (err.status === 401) err.message = `${model} 鉴权失败（401），请检查对应的 API Key：${err.message}`;
    throw err;
  }

  const reader = response.body.getReader();
  // ⚠️ 必须带 {stream:true}：中文一个字符 3 字节，跨 chunk 切断就会乱码
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let usage = null;
  let finishReason = 'stop';

  // 见文件头注释第 2 条：tool_call 分片按 index 聚合
  const partialCalls = new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        if (!line.startsWith('data:')) continue; // 忽略 event:/id:/注释行

        const payload = line.slice(5).trim();
        // 见文件头注释第 3 条：终止符不是 JSON
        if (payload === '[DONE]') {
          yield* flushCalls(partialCalls);
          partialCalls.clear();
          yield { type: 'done', reason: finishReason, usage: usage || {} };
          return;
        }

        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue; // 坏行跳过，别中断整个流
        }

        if (chunk.error) throw new ProviderError(`${model} 报错：${chunk.error.message || JSON.stringify(chunk.error)}`);
        if (chunk.usage) usage = {
          promptTokens: chunk.usage.prompt_tokens ?? null,
          completionTokens: chunk.usage.completion_tokens ?? null
        };

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta || {};
        // 有些厂商（含百炼的部分模型）在流里也回 reasoning_content
        if (delta.reasoning_content) yield { type: 'thinking', text: delta.reasoning_content };

        const text = stripThinking(delta.content || '');
        if (text) yield { type: 'text', text };

        for (const tc of delta.tool_calls || []) {
          const idx = tc.index ?? 0;
          const cur = partialCalls.get(idx) || { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          // arguments 是增量片段，必须拼起来才是完整 JSON
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          partialCalls.set(idx, cur);
        }

        // finish_reason=tool_calls 表示这一轮的工具调用已经发完，可以吐出去了
        if (finishReason === 'tool_calls' && partialCalls.size) {
          yield* flushCalls(partialCalls);
          partialCalls.clear();
        }
      }
    }

    // 流断了但没收到 [DONE]
    yield* flushCalls(partialCalls);
    yield { type: 'done', reason: 'eof', usage: usage || {} };
  } finally {
    try { await reader.cancel(); } catch { /* 已经关了 */ }
  }
}

/** 把聚合好的分片吐成 canonical tool_call，并按 index 排序保证顺序稳定 */
function* flushCalls(partialCalls) {
  const entries = [...partialCalls.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, c] of entries) {
    if (!c.name) continue; // 只有 arguments 没有 name 的残片直接丢
    yield {
      type: 'tool_call',
      id: c.id || `call_${c.name}_${Math.random().toString(36).slice(2, 8)}`,
      name: c.name,
      // 见 base.js：这家是 JSON 字符串，统一收敛成对象
      arguments: parseToolArguments(c.args)
    };
  }
}
