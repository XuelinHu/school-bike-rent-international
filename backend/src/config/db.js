import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  // ⚠️ 宿主机进程必须用 127.0.0.1。`mysql_1` 是 Docker 网络 1panel-network 的内部别名，
  // Docker 内嵌 DNS 只在容器网络内可用，宿主机解析不了（getaddrinfo EAI_AGAIN）。
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Java@c1024',
  database: process.env.DB_NAME || 'student_bike_rental',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

/**
 * mysql2 预处理语句的坑：参数里只要有一个 `undefined`，`execute()` 会**直接抛**
 *   Bind parameters must not contain undefined. To pass SQL NULL specify JS null
 * 而不是把它当成 NULL。这在路由层防不胜防——前端没传某个可选字段、
 * 解构默认值没覆盖到、`x ?? y` 里 y 本身也是 undefined，都会踩到。
 * 实测复现：站点表单只填中英文名和容量、把经纬度留空 → POST /api/stations 直接 500。
 *
 * 所以在连接层统一兜底，把 undefined 归一成 null，同时打 warn 保留可观测性——
 * 真正的字段遗漏仍然能在日志里被发现，而不是被静默吞掉。
 */
function normalizeParams(params) {
  if (Array.isArray(params)) {
    return params.map((v) => (v === undefined ? null : v));
  }
  // namedPlaceholders 打开时参数也可以是对象
  if (params && typeof params === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(params)) out[k] = v === undefined ? null : v;
    return out;
  }
  return params;
}

function hasUndefined(params) {
  if (Array.isArray(params)) return params.some((v) => v === undefined);
  if (params && typeof params === 'object') return Object.values(params).some((v) => v === undefined);
  return false;
}

/** 给一个连接（pool 或事务 conn）装上 execute 兜底 */
function guard(conn) {
  const rawExecute = conn.execute.bind(conn);
  conn.execute = (sql, params) => {
    if (hasUndefined(params)) {
      console.warn('[db] 查询参数里出现 undefined，已按 NULL 处理。SQL:',
        String(sql).replace(/\s+/g, ' ').slice(0, 120));
    }
    return rawExecute(sql, normalizeParams(params));
  };
  return conn;
}

guard(pool);

export async function tx(work) {
  const conn = guard(await pool.getConnection());
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
