import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { assertDatabaseName } from '../config/databaseName.js';
import { runMigrations } from '../db/migrations.js';

dotenv.config();

if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD must be set in backend/.env.');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const database = assertDatabaseName(process.env.DB_NAME || 'student_bike_rental');
const connectionOptions = {
  host: process.env.DB_HOST || 'mysql_1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD
};

const admin = await mysql.createConnection(connectionOptions);
try {
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
} finally {
  await admin.end();
}

const pool = mysql.createPool({ ...connectionOptions, database, multipleStatements: true });
try {
  const schema = await fs.readFile(path.join(root, 'sql', 'schema.sql'), 'utf8');
  const migrationDir = path.join(root, 'sql', 'migrations');
  const migrationFiles = await fs.readdir(migrationDir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const migrations = [{
    version: '001_initial_schema',
    description: 'Initial student bike rental schema',
    sql: schema
  }];

  for (const file of migrationFiles.filter((name) => /\.(sql|js)$/i.test(name)).sort()) {
    const match = /^(\d{3,}_[a-z0-9_]+)\.(sql|js)$/i.exec(file);
    if (!match) throw new Error(`Invalid migration filename: ${file}`);
    const source = await fs.readFile(path.join(migrationDir, file), 'utf8');
    if (file.toLowerCase().endsWith('.js')) {
      const module = await import(pathToFileURL(path.join(migrationDir, file)).href);
      const definition = module.default;
      if (definition?.id !== match[1] || typeof definition.up !== 'function') {
        throw new Error(`Migration id/up mismatch in ${file}`);
      }
      migrations.push({ ...definition, version: definition.id, checksum: createHash('sha256').update(source).digest('hex') });
    } else {
      migrations.push({
        version: match[1],
        description: match[1].replace(/^\d+_/, '').replace(/_/g, ' '),
        checksum: createHash('sha256').update(source).digest('hex'),
        sql: source
      });
    }
  }

  const seen = new Set();
  for (const migration of migrations) {
    if (seen.has(migration.version)) throw new Error(`Duplicate migration version: ${migration.version}`);
    seen.add(migration.version);
    migration.checksum ||= createHash('sha256').update(migration.sql).digest('hex');
  }

  const lockName = `bike-rental-${createHash('sha256').update(database).digest('hex').slice(0, 32)}`;
  await runMigrations(await pool.getConnection(), migrations, lockName);

  const seed = await fs.readFile(path.join(root, 'sql', 'seed.sql'), 'utf8');
  await pool.query(seed);
  console.log(`Database ${database} initialized.`);
} finally {
  await pool.end();
}
