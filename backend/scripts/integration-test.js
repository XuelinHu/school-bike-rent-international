import dotenv from 'dotenv';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { assertDemoSeedAllowed } from '../src/utils/demoSeedGuard.js';

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
