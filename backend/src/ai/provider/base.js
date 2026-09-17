/**
 * provider 抽象层：canonical 消息 / 事件定义 + 各家协议差异的归一化工具。
 *
 * 设计原则：**agent.js 只认 canonical 结构，永远不拼任何一家的报文**。
 * 一旦让上层去处理"Ollama 的 arguments 是对象、OpenAI 的是 JSON 字符串"这类差异，
 * 结果就是换一个模型就崩，而且崩在很深的地方。
 *
 * ── canonical 消息 ──────────────────────────────────────────────
 *   { role: 'system'|'user'|'assistant'|'tool', content: string,
 *     toolCalls?: [{ id, name, arguments }],   // arguments 一律是**对象**
 *     toolCallId?: string, name?: string }     // role='tool' 时用
 *
 * ── canonical 事件（provider 只吐这几种）─────────────────────────
 *   { type: 'text',     text }
 *   { type: 'thinking', text }
 *   { type: 'tool_call', id, name, arguments }   // 已是完整调用
 *   { type: 'done', reason, usage }
 *   { type: 'error', message }
 *
 * ── canonical 工具定义 ──────────────────────────────────────────
 *   { name, description, parameters }            // parameters 是 JSON Schema
 */

export class ProviderError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * 把 JSON Schema 收紧成各家都吃得下的最小子集。
 *
 * 起因：Ollama 与 OpenAI 对 `parameters` 的宽容度不同，而模型自己幻觉出来的
 * 嵌套 schema 经常带着 `additionalProperties`、`$schema`、`format: 'date-time'` 之类
 * 上游不认的字段，直接 400。统一在这里削平，比在每个 provider 里各写一遍稳。
 */
export function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  const out = { type: schema.type || 'object' };
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      out.properties[key] = normalizeSchema(val);
      if (val && val.enum) out.properties[key].enum = val.enum;
      if (val && val.items) out.properties[key].items = normalizeSchema(val.items);
    }
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required;
  return out;
}

/** 工具定义转 canonical，顺手削平 schema */
export function normalizeToolDef(def) {
  return {
    name: def.name,
    description: def.description,
    parameters: normalizeSchema(def.parameters)
  };
}

/**
 * 把模型返回的工具参数统一成对象。
 *
 * ⚠️ 这是两家最容易踩的差异：
 *   - Ollama 原生 /api/chat 返回的 `arguments` **已经是对象**
 *   - OpenAI 兼容接口返回的是 **JSON 字符串**（流式下还要跨 chunk 拼接）
 *   - 模型偶尔会吐空串、带尾逗号的坏 JSON、或者把参数包成 {"value": {...}}
 * 这里全部收敛成对象；解析不了就退回 {}，让工具自己报"缺参数"，而不是整轮对话炸掉。
 */
export function parseToolArguments(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  const text = String(raw).trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // 有些模型会输出 ```json ... ``` 包裹的内容
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        const parsed = JSON.parse(fenced[1].trim());
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch { /* 落到下面 */ }
    }
    return {};
  }
}

/**
 * 剥掉 content 里的  thinking...<｜end▁of▁thinking｜>。
 * qwen3 即使传了 think:false 偶尔也会把思考内容漏进 content，
 * 而这段文字**绝不能进 TTS**——会把模型的内心独白念给用户听。
 */
export function stripThinking(text) {
  if (!text) return '';
  // ⚠️ 这里**绝对不能 trim()**。这个函数的入参是**流式分片**，不是完整回答：
  // 英文分片长这样 ["This", " system", " lets", " students"]，词与词之间的那个空格
  // 就在分片开头。trim 掉之后拼出来是 "Thissystemletsstudents" —— 中文看不出问题，
  // 英文会被粘成一坨，而这个回答是要交给 TTS 朗读的。
  // 需要判断"是不是空内容"的调用方自己 trim。
  return String(text)
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<think(?:ing)?>[\s\S]*$/i, '');
}

/**
 * qwen3 的"只说不做"退化检测。
 * 模型在思考里写了"我应该调用 available_bikes"，却没真落进 tool_calls，
 * 这段原文会作为答案吐给用户。检测到就把该轮文本判为无效，避免污染会话。
 */
export function looksLikeRawToolCall(text) {
  if (!text) return false;
  return /<tool_call>|<\/tool_call>|"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"/i.test(text);
}

/** 把上游 HTTP 错误翻译成带 status 的 ProviderError，便于路由层区分 401/429 */
export async function toProviderError(response, label) {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 500);
  } catch { /* 读不到就算了 */ }
  const status = response.status;
  return new ProviderError(
    `${label} 返回 ${status}${detail ? `：${detail}` : ''}`,
    { status, retryable: status === 429 || status >= 500 }
  );
}
