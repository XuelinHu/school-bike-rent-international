import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';
import { runMigrations } from '../db/migrations.js';
import { loadMigrations } from '../db/loadMigrations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const database = process.env.PGDATABASE || 'student_bike_rental';

try {
  const { migrations, lockName } = await loadMigrations(root, database);
  await runMigrations(await pool.getConnection(), migrations, lockName);
  console.log(`PostgreSQL migrations checked for ${database}; seed data was not run.`);
} finally {
  await pool.end();
}
