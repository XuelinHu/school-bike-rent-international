import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { pool } from '../config/db.js';
import { runMigrations } from '../db/migrations.js';
import { loadMigrations } from '../db/loadMigrations.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const database = process.env.PGDATABASE || 'student_bike_rental';
const { migrations, lockName } = await loadMigrations(root, database);

try {
  await runMigrations(await pool.getConnection(), migrations, lockName);
  await pool.query(await fs.readFile(path.join(root, 'postgres', 'seed.sql'), 'utf8'));
  console.log(`PostgreSQL database ${database} initialized.`);
} finally {
  await pool.end();
}
