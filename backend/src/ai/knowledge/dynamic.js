/**
 * 动态业务快照：从库里现算「站点清单 + 车型费率表」，用来给模型打底，避免它编站点名和价格。
 *
 * ⚠️ 刻意**不放实时可租数量**。原因有三：
 *   1. 它每分钟都在变，塞进 system 会击穿 Ollama 的 prompt cache（缓存按 token 前缀命中）
 *   2. 模型会拿快照里的旧数字当答案，而且说得理直气壮
 *   3. 实时数据本该走工具查，那条路径还有权限校验
 * 所以这里只放"慢变量"：站点名、车型费率。实时数字一律交给 tools/。
 */
import { pool } from '../../config/db.js';

/** 快照变化很慢，10 分钟足够，别每次对话都查库 */
const TTL_MS = 10 * 60 * 1000;

let cache = { at: 0, text: { 'zh-CN': '', 'en-US': '' } };

export function invalidateSnapshot() {
  cache = { at: 0, text: { 'zh-CN': '', 'en-US': '' } };
}

async function build() {
  const [stations] = await pool.execute(
    'SELECT id, name_zh, name_en FROM stations ORDER BY id'
  );
  const [rates] = await pool.execute(
    `SELECT type, MIN(hourly_rate) AS min_rate, MAX(hourly_rate) AS max_rate, COUNT(*) AS n
     FROM bikes GROUP BY type ORDER BY type`
  );

  const stationZh = stations.map((s) => `${s.name_zh}(#${s.id})`).join('、');
  const stationEn = stations.map((s) => `${s.name_en}(#${s.id})`).join(', ');
  const rateZh = rates
    .map((r) => `${r.type} ${r.min_rate === r.max_rate ? r.min_rate : `${r.min_rate}~${r.max_rate}`} 元/小时`)
    .join('；');
  const rateEn = rates
    .map((r) => `${r.type} ${r.min_rate === r.max_rate ? r.min_rate : `${r.min_rate}-${r.max_rate}`} CNY/hour`)
    .join('; ');

  return {
    'zh-CN': `【站点清单】${stationZh || '（暂无站点）'}\n【车型费率】${rateZh || '（暂无车辆）'}`,
    'en-US': `[Stations] ${stationEn || '(none)'}\n[Rates by type] ${rateEn || '(no bikes)'}`
  };
}

/** 取快照文本；失败时返回空串——快照挂了不该让整个对话失败 */
export async function getSnapshot(lang = 'zh-CN') {
  if (cache.text[lang] && Date.now() - cache.at < TTL_MS) return cache.text[lang];
  try {
    cache = { at: Date.now(), text: await build() };
    return cache.text[lang] || '';
  } catch (e) {
    console.warn('[ai] 业务快照生成失败，本轮不带快照：', e.message);
    return '';
  }
}
