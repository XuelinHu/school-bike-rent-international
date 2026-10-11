import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { assertDemoSeedAllowed } from '../src/utils/demoSeedGuard.js';
import { pool } from '../src/config/db.js';

dotenv.config();

if (!/_test$/i.test(process.env.DB_NAME || '')) {
  throw new Error('Integration tests require DB_NAME to end with _test.');
}

assertDemoSeedAllowed(process.env);

const root = process.cwd();
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}/api`;
const env = { ...process.env, PORT: String(port), BASE_URL: baseUrl };

function run(script) {
  const result = spawnSync(process.execPath, [script], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}.`);
}

run('src/utils/initDb.js');
try {
  const [foreignKeys] = await pool.query(
    `SELECT kcu.COLUMN_NAME AS column_name,
            kcu.REFERENCED_TABLE_NAME AS referenced_table,
            kcu.REFERENCED_COLUMN_NAME AS referenced_column,
            rc.DELETE_RULE AS delete_rule
     FROM information_schema.KEY_COLUMN_USAGE kcu
     JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      AND rc.TABLE_NAME = kcu.TABLE_NAME
     WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
       AND kcu.TABLE_NAME = 'rental_orders'
       AND kcu.COLUMN_NAME IN ('start_station_id', 'end_station_id')`
  );
  for (const column of ['start_station_id', 'end_station_id']) {
    const constraint = foreignKeys.find((row) => row.column_name === column);
    assert.equal(constraint?.referenced_table, 'stations', `${column} must reference stations`);
    assert.equal(constraint?.referenced_column, 'id', `${column} must reference station ids`);
    assert.equal(constraint?.delete_rule, 'RESTRICT', `${column} must preserve referenced history`);
  }
  const [stationIndexes] = await pool.query(
    `SELECT DISTINCT COLUMN_NAME AS column_name
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'rental_orders'
       AND COLUMN_NAME IN ('start_station_id', 'end_station_id')`
  );
  for (const column of ['start_station_id', 'end_station_id']) {
    assert.ok(stationIndexes.some((index) => index.column_name === column), `${column} must have a supporting index`);
  }
  const [migrationRows] = await pool.query(
    "SELECT checksum FROM schema_migrations WHERE version = '003_station_history_foreign_keys'"
  );
  assert.match(migrationRows[0]?.checksum || '', /^[a-f0-9]{64}$/);
} finally {
  await pool.end();
}
run('src/utils/seedDemoData.js');

const api = spawn(process.execPath, ['src/server.js'], { cwd: root, env, stdio: 'inherit' });
try {
  await waitForApi(baseUrl, api);
  run('scripts/smoke-test.js');
  run('scripts/concurrency-test.js');
} finally {
  if (api.exitCode === null) {
    api.kill('SIGTERM');
    await Promise.race([once(api, 'exit'), delay(5000)]);
    if (api.exitCode === null) api.kill('SIGKILL');
  }
}

console.log('Isolated database integration tests passed.');

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port: available } = server.address();
  server.close();
  await once(server, 'close');
  return available;
}

async function waitForApi(url, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error('Temporary API did not become ready within 10 seconds.');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
