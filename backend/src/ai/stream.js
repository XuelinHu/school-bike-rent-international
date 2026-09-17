/**
 * NDJSON 流式写出。
 *
 * 为什么是 NDJSON 而不是 SSE：
 *   - 前端用 `fetch` + `ReadableStream` 读，**能带 Authorization 头**。
 *     EventSource 只能 GET、不能带自定义头，改 query 传 token 会把 JWT 写进 URL 和访问日志。
 *   - NDJSON 少一层 `data: ` 前缀，且和 Ollama 上游格式一致，前后端能共用同一套切行逻辑。
 *
 * ⚠️ 三个隐形杀手，都在这一个文件里处理：
 *   1. `res.flushHeaders()` 之后，app.js 末尾那个全局错误中间件**再也写不了响应**
 *      （会抛 ERR_HTTP_HEADERS_SENT）。所以流式路由必须自己 try/catch 全部异常、
 *      写一条 error 事件再 end()，绝不能 next(err)。
 *   2. 反代（Nginx/FRP 之类）默认会缓冲响应，导致"流式"变成一次性到达。
 *      必须显式 `X-Accel-Buffering: no` + no-transform。
 *   3. 长连接会被中间设备判死。15 秒一个 ping 事件保活。
 */

const HEARTBEAT_MS = 15_000;

/**
 * 建一个 NDJSON 写出器。
 * @param {import('express').Response} res
 */
export function createNdjsonStream(res) {
  let closed = false;

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // 见文件头注释第 2 条
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // 见文件头注释第 3 条
  const heartbeat = setInterval(() => {
    if (!closed) write({ type: 'ping', t: Date.now() });
  }, HEARTBEAT_MS);
  // 别让心跳把 Node 进程钉住不退出
  heartbeat.unref?.();

  function write(event) {
    if (closed) return false;
    try {
      // 一条事件一行，\n 结尾 —— 前端按行切
      res.write(`${JSON.stringify(event)}\n`);
      return true;
    } catch {
      // 客户端断开时 write 会抛，这里吞掉，由外层 finally 收尾
      closed = true;
      return false;
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try { res.end(); } catch { /* 已经断了 */ }
  }

  /** 客户端断开（关标签页 / 点停止）时通知上层去 abort 上游请求 */
  function onClientClose(handler) {
    res.on('close', () => {
      if (!closed) {
        closed = true;
        clearInterval(heartbeat);
      }
      handler();
    });
  }

  return { write, close, onClientClose, get closed() { return closed; } };
}
