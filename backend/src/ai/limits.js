/**
 * AI 接口的两道闸门：按用户的请求频率 + 全局并发。
 *
 * ⚠️ 和 utils/rateLimit.js 一样，都是**内存态、单进程有效、重启清零**。
 * 它的目的是保护这块 3090 不被一个用户拖垮，不是安全边界。
 *
 * 为什么必须做全局并发闸门：Ollama 默认单槽串行。放两个请求进去不会变快，
 * 只会让两个人都等更久，而且 14B 占着 10GB 显存，第二个模型一旦被换入换出，
 * 同机的其它项目（比如另一个跑着 eval 的 Python 进程）会直接被挤爆显存。
 */
import { aiConfig } from './config.js';
import { createLimiter } from '../utils/rateLimit.js';
import { HttpError } from '../utils/errors.js';

/** 每人 10 分钟最多 30 轮对话——正常使用远远够，刷子会被挡住 */
const perUser = createLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

export function checkUserQuota(userId) {
  const r = perUser(`ai:${userId}`);
  if (!r.allowed) {
    const mins = Math.ceil(r.retryAfterMs / 60000);
    throw new HttpError(429, `提问太频繁了，请 ${mins} 分钟后再试。`);
  }
  return r;
}

// ── 全局并发闸门（带排队）──────────────────────────────────────
let running = 0;
const queue = [];

/** 排队超时：等太久不如直接告诉用户稍后再试，占着连接没意义 */
const QUEUE_TIMEOUT_MS = 60_000;

function pump() {
  if (running >= aiConfig.maxConcurrency) return;
  const next = queue.shift();
  if (!next) return;
  running += 1;
  next();
}

/**
 * 拿一个推理槽位。返回 release()，**必须**在 finally 里调用。
 * 队满时抛 503，而不是无限排队——否则用户只会看到一个永远转圈的界面。
 */
export function acquireSlot() {
  return new Promise((resolve, reject) => {
    if (queue.length >= aiConfig.maxQueue) {
      reject(new HttpError(503, '助手正忙，排队的人有点多，请稍后再试。'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const i = queue.indexOf(entry);
      if (i >= 0) queue.splice(i, 1);
      reject(new HttpError(503, '助手正忙，等太久了，请稍后再试。'));
    }, QUEUE_TIMEOUT_MS);

    const entry = () => {
      if (settled) {
        // 已经超时走人了，把槽位让给下一个
        running -= 1;
        pump();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(() => {
        running -= 1;
        pump();
      });
    };

    queue.push(entry);
    pump();
  });
}

/** 给管理台看的实时状态 */
export function gateStatus() {
  return { running, queued: queue.length, maxConcurrency: aiConfig.maxConcurrency };
}
