import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { assertDemoSeedAllowed } from '../src/utils/demoSeedGuard.js';
import { pool } from '../src/config/db.js';

dotenv.config();

if (!/_test$/i.test(process.env.PGDATABASE || '')) {
  throw new Error('Integration tests require PGDATABASE to end with _test.');
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
  const foreignKeysResult = await pool.query(
    `SELECT kcu.column_name, ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column, rc.delete_rule
     FROM information_schema.key_column_usage kcu
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_schema = kcu.constraint_schema AND ccu.constraint_name = kcu.constraint_name
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_schema = kcu.constraint_schema AND rc.constraint_name = kcu.constraint_name
     WHERE kcu.table_schema = current_schema() AND kcu.table_name = 'rental_orders'
       AND kcu.column_name IN ('start_station_id', 'end_station_id')`
  );
  const foreignKeys = foreignKeysResult.rows;
  for (const column of ['start_station_id', 'end_station_id']) {
    const constraint = foreignKeys.find((row) => row.column_name === column);
    assert.equal(constraint?.referenced_table, 'stations', `${column} must reference stations`);
    assert.equal(constraint?.referenced_column, 'id', `${column} must reference station ids`);
    assert.equal(constraint?.delete_rule, 'RESTRICT', `${column} must preserve referenced history`);
  }
  const stationIndexesResult = await pool.query(
    `SELECT DISTINCT a.attname AS column_name
     FROM pg_index i
     JOIN pg_class t ON t.oid = i.indrelid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
     WHERE t.relname = 'rental_orders' AND a.attname IN ('start_station_id', 'end_station_id')`
  );
  const stationIndexes = stationIndexesResult.rows;
  for (const column of ['start_station_id', 'end_station_id']) {
    assert.ok(stationIndexes.some((index) => index.column_name === column), `${column} must have a supporting index`);
  }
  const migrationResult = await pool.query(
    "SELECT checksum FROM schema_migrations WHERE version = '003_station_history_foreign_keys'"
  );
  assert.match(migrationResult.rows[0]?.checksum || '', /^[a-f0-9]{64}$/);
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
