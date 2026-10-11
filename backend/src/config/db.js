import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;
types.setTypeParser(20, (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
});

function bindPlaceholders(sql) {
  let index = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let result = '';

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      result += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      result += char;
      if (char === '*' && next === '/') {
        result += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      result += char;
      if (char === quote && next === quote) {
        result += next;
        i += 1;
      } else if (char === quote && sql[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (char === '-' && next === '-') {
      result += `${char}${next}`;
      i += 1;
      lineComment = true;
    } else if (char === '/' && next === '*') {
      result += `${char}${next}`;
      i += 1;
      blockComment = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else if (char === '?') {
      result += `$${++index}`;
    } else {
      result += char;
    }
  }
  return result;
}

const poolOptions = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'student_bike_rental_app',
      password: process.env.PGPASSWORD || undefined,
      database: process.env.PGDATABASE || 'student_bike_rental',
      ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: true } : undefined
    };

if (process.env.NODE_ENV === 'production' && !process.env.PGPASSWORD && !process.env.DATABASE_URL) {
  throw new Error('Set PGPASSWORD or DATABASE_URL for PostgreSQL.');
}

const rawPool = new Pool({ ...poolOptions, max: Number(process.env.PGPOOL_MAX || 10) });

function adapt(client) {
  return {
    async query(sql, params) {
      return client.query(bindPlaceholders(sql), params);
    },
    async execute(sql, params = []) {
      const result = await client.query(bindPlaceholders(sql), params.map((value) => value === undefined ? null : value));
      return [result.rows, { affectedRows: result.rowCount, rowCount: result.rowCount }];
    },
    release: client.release?.bind(client)
  };
}

export const pool = {
  async query(sql, params) {
    return rawPool.query(bindPlaceholders(sql), params);
  },
  async execute(sql, params = []) {
    const result = await rawPool.query(bindPlaceholders(sql), params.map((value) => value === undefined ? null : value));
    return [result.rows, { affectedRows: result.rowCount, rowCount: result.rowCount }];
  },
  async getConnection() {
    return adapt(await rawPool.connect());
  },
  end() {
    return rawPool.end();
  }
};

export async function tx(work) {
  const conn = await pool.getConnection();
  try {
    await conn.query('BEGIN');
    const result = await work(conn);
    await conn.query('COMMIT');
    return result;
  } catch (error) {
    await conn.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

export { bindPlaceholders };
