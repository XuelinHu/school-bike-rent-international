/**
 * 分页与列表查询工具。
 *
 * LIMIT / OFFSET values are inlined only after integer validation and bounds checking.
 */

const MAX_OFFSET = 2 ** 31 - 1;

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 解析分页参数，结果一定是校验过的安全整数。
 * 非法输入静默回落到默认值（page=1），而不是报错——列表页不该因为
 * 用户手改了一下 URL 就白屏。
 *
 * @returns {{page: number, pageSize: number, offset: number}}
 */
export function parsePaging(query = {}, { defaultPageSize = 10, maxPageSize = 100 } = {}) {
  const pageSize = clamp(toInt(query.pageSize, defaultPageSize), 1, maxPageSize);
  // 先定 pageSize 再夹 page，保证 offset 一定落在 PostgreSQL 安全范围内，
  // 而不是夹完 offset 再反推 page（那样页码会跳）。
  const maxPage = Math.max(1, Math.floor(MAX_OFFSET / pageSize));
  const page = clamp(toInt(query.page, 1), 1, maxPage);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * 转义 LIKE 的模式串。`%` `_` `\` 是 LIKE 的元字符，不转义的话
 * 用户搜一个 `%` 就会退化成全表匹配。
 * 返回值直接用于拼 `%${escapeLike(kw)}%`。
 */
export function escapeLike(input, { maxLength = 50 } = {}) {
  if (input === undefined || input === null) return '';
  return String(input)
    .trim()
    .slice(0, maxLength)
    .replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * 从白名单构造 ORDER BY。
 * 排序字段直接来自 query，绝不能拼进 SQL，必须走白名单映射。
 *
 * @param {string} sort        形如 'id' / '-created_at'（前缀 - 表示倒序）
 * @param {Record<string,string>} whitelist  键为对外的排序名，值为真实列名
 * @param {string} fallback    未命中时使用的固定排序
 */
export function buildOrderBy(sort, whitelist = {}, fallback = '') {
  if (!sort) return fallback;
  const raw = String(sort);
  const desc = raw.startsWith('-');
  const key = desc ? raw.slice(1) : raw;
  const column = Object.prototype.hasOwnProperty.call(whitelist, key) ? whitelist[key] : null;
  if (!column) return fallback;
  return `${column} ${desc ? 'DESC' : 'ASC'}`;
}

/**
 * 执行分页查询，返回统一的列表信封。
 *
 * @param {object} executor PostgreSQL pool or transaction client
 * @param {object} cfg
 * @param {string}   cfg.select    SELECT 的列（**写白名单列，不要 SELECT \***）
 * @param {string}   cfg.from      FROM 子句（含 JOIN）
 * @param {string[]} cfg.where     条件片段数组，用 AND 连接
 * @param {any[]}    cfg.params    与 where 对应的参数
 * @param {string}   cfg.groupBy   可选
 * @param {string}   cfg.orderBy   ORDER BY 子句（请用 buildOrderBy 生成）
 * @param {number}   cfg.page
 * @param {number}   cfg.pageSize
 * @returns {Promise<{list: any[], total: number, page: number, pageSize: number}>}
 */
export async function paginateRows(executor, cfg) {
  const { select, from, where = [], params = [], groupBy = '', orderBy = '', page, pageSize } = cfg;

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const groupSql = groupBy ? `GROUP BY ${groupBy}` : '';

  // 再夹一次，保证直接调用 paginateRows 时也拿到安全整数。
  // 这两个值只可能来自 parseInt + clamp，可以放心内联（见文件头注释）。
  const { page: safePage, pageSize: safePageSize, offset: safeOffset } = parsePaging({ page, pageSize });

  // 有 GROUP BY 时，COUNT(*) 会按组返回多行，必须包一层子查询才拿到"组数"
  const countSql = groupBy
    ? `SELECT COUNT(*) AS total FROM (SELECT 1 FROM ${from} ${whereSql} ${groupSql}) AS g`
    : `SELECT COUNT(*) AS total FROM ${from} ${whereSql}`;

  const orderSql = orderBy ? `ORDER BY ${orderBy}` : '';
  const listSql =
    `SELECT ${select} FROM ${from} ${whereSql} ${groupSql} ${orderSql} ` +
    `LIMIT ${safePageSize} OFFSET ${safeOffset}`;

  const [[countRow]] = await executor.execute(countSql, params);
  const [list] = await executor.execute(listSql, params);

  return {
    list,
    total: Number(countRow?.total ?? 0),
    page: safePage,
    pageSize: safePageSize
  };
}

/**
 * 由 query 片段拼装 WHERE。每个片段自带占位符，参数按顺序收集。
 * 用法：
 *   const w = whereBuilder();
 *   w.add('u.status = ?', status);
 *   w.addIf(keyword, '(u.username LIKE ? OR u.name LIKE ?)', `%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`);
 *   const { sql, params } = w.build();
 */
export function whereBuilder() {
  const clauses = [];
  const params = [];
  return {
    add(condition, ...values) {
      if (!condition) return this;
      clauses.push(condition);
      params.push(...values);
      return this;
    },
    /** 值为空时整条跳过，避免把 undefined 带进 SQL */
    addIf(value, condition, ...values) {
      if (value === undefined || value === null || value === '') return this;
      return this.add(condition, ...values);
    },
    get length() {
      return clauses.length;
    },
    build() {
      return { where: clauses, params };
    }
  };
}
