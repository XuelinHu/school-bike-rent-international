const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8032/api';

export function token() {
  return localStorage.getItem('token') || '';
}

/**
 * 流式请求（NDJSON）。与 request() 并列——不合并是因为 request() 内部直接
 * `await response.json()`，对流式响应根本走不通；但 API_BASE / token 必须共用，
 * 否则两套配置迟早对不上。
 *
 * 为什么是 fetch + ReadableStream 读 NDJSON，而不是 EventSource：
 *   **EventSource 只能发 GET，带不了 Authorization 头**。把 JWT 塞进 query string
 *   会写进浏览器历史和服务器访问日志，等于把凭证泄漏到日志里。
 *
 * 用法：`for await (const ev of streamRequest('/ai/chat', { body, signal }))`
 */
export async function* streamRequest(path, { body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
    signal
  });

  // ⚠️ 鉴权失败(401)、限流(429)、参数错误(400) 时后端返回的是**普通 JSON**，不是流。
  // 不看 content-type 就按流解析，用户会得到一个空白回答 + 一个静默失败。
  const ctype = response.headers.get('content-type') || '';
  if (!ctype.includes('ndjson')) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `请求失败（HTTP ${response.status}）`);
  }

  const reader = response.body.getReader();
  // ⚠️ 必须带 {stream:true}：中文一个字符 3 字节，跨 chunk 切断会乱码
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // NDJSON：一行一个 JSON，最后一行可能不完整，留在 buffer 里等下一片
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch {
          /* 半行/坏行跳过，不要中断整个流 */
        }
      }
    }
  } finally {
    // 用户点"停止"时 generator 会被提前 return，这里要把上游连接放掉
    try { await reader.cancel(); } catch { /* 已经关了 */ }
  }
}

export async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({ message: 'Network error' }));
  if (!response.ok || payload.code >= 400) throw new Error(payload.message || 'Request failed');
  return payload.data;
}
