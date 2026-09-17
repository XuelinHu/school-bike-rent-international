/**
 * 极简内存限流器（固定窗口计数）。
 *
 * ⚠️ 适用边界，务必知悉：
 *   - **单进程有效**。多进程 / PM2 cluster / 多实例部署时各算各的，等于把额度翻倍。
 *   - **重启即清零**。本项目的 `npm run dev` 用 nodemon，改一次代码就重置一次计数。
 *   - 因此它只用来抬高暴力破解的成本，不是安全边界。真要防刷需要上 Redis 或网关层限流。
 *
 * 之所以不引第三方（express-rate-limit 等）：保持项目零新增依赖，
 * 而这里的需求就是一个十几行的计数窗口。
 */

/** 定期清理过期条目，避免 Map 随 IP/用户名无上限增长 */
function sweep(store, now) {
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * 创建一个限流器。
 *
 * @param {object} cfg
 * @param {number} cfg.windowMs  窗口长度（毫秒）
 * @param {number} cfg.max       窗口内允许的次数
 * @param {number} [cfg.maxKeys] 存储条目上限，超出时强制清理一次
 * @returns {(key: string) => {allowed: boolean, remaining: number, retryAfterMs: number}}
 */
export function createLimiter({ windowMs = 10 * 60 * 1000, max = 5, maxKeys = 5000 } = {}) {
  const store = new Map();
  let lastSweep = 0;

  return function hit(key) {
    const now = Date.now();

    // 每 60 秒或条目过多时清理一次，避免每次请求都全表扫描
    if (now - lastSweep > 60_000 || store.size > maxKeys) {
      sweep(store, now);
      lastSweep = now;
    }

    const entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
    }

    entry.count += 1;
    if (entry.count > max) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
    }
    return { allowed: true, remaining: max - entry.count, retryAfterMs: 0 };
  };
}

/** 取客户端 IP。部署在反向代理后面时依赖 X-Forwarded-For，本项目走 FRP，没有可信代理层。 */
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
