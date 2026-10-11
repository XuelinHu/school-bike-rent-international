import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { assertDatabaseName } from '../src/config/databaseName.js';

dotenv.config();

const database = assertDatabaseName(process.env.DB_NAME || '');
if (!/_load_test$/i.test(database)) throw new Error('Load tests require a dedicated DB_NAME ending in _load_test.');
if (process.env.LOAD_TEST_CONFIRM !== '1') throw new Error('Set LOAD_TEST_CONFIRM=1 to run against the dedicated load-test database.');

const requestCount = Number(process.env.LOAD_TEST_REQUESTS || 40);
if (!Number.isInteger(requestCount) || requestCount < 10 || requestCount > 100) {
  throw new Error('LOAD_TEST_REQUESTS must be an integer from 10 to 100.');
}

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = randomBytes(6).toString('hex');
const usernamePrefix = `lt${runId}_`;
const bikePrefix = `LOAD-${runId}-`;
const password = `LoadTest-${randomBytes(12).toString('hex')}`;
const userIds = [];
const bikeIds = [];
let connection;
let apiProcess;
let apiExit;
let port;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getFreePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

async function startApi() {
  port = await getFreePort();
  apiProcess = spawn(process.execPath, ['src/server.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      DB_NAME: database,
      JWT_SECRET: randomBytes(32).toString('hex'),
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  const collect = (chunk) => { logs = `${logs}${chunk}`.slice(-8000); };
  apiProcess.stdout.on('data', collect);
  apiProcess.stderr.on('data', collect);
  apiExit = new Promise((resolve) => apiProcess.once('exit', (code) => resolve(code)));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (apiProcess.exitCode !== null) throw new Error(`Load-test API exited early (${apiProcess.exitCode}): ${logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Load-test API did not become healthy: ${logs}`);
}

async function request(route, { method = 'GET', token, body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000)
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

async function runPhase(name, operations, validate) {
  const startedAt = performance.now();
  const settled = await Promise.allSettled(operations);
  const elapsedMs = performance.now() - startedAt;
  const failures = settled.flatMap((item, index) => {
    if (item.status === 'rejected') return [`request ${index + 1}: ${item.reason.message}`];
    return validate(item.value, index) ? [] : [`request ${index + 1}: HTTP ${item.value.status}`];
  });
  assert(failures.length === 0, `${name} phase failed (${failures.length}/${operations.length}): ${failures.slice(0, 3).join('; ')}`);
  const latencies = settled.map((item) => item.value.elapsedMs).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (value) => latencies[Math.max(0, Math.ceil(latencies.length * value) - 1)] || 0;
  const rate = (operations.length / elapsedMs) * 1000;
  console.log(`${name}: ${operations.length}/${operations.length} ok; ${rate.toFixed(1)} req/s; p50 ${percentile(0.5).toFixed(0)} ms; p95 ${percentile(0.95).toFixed(0)} ms; total ${elapsedMs.toFixed(0)} ms`);
  return settled.map((item) => item.value.payload.data);
}

async function timed(operation) {
  const startedAt = performance.now();
  const value = await operation;
  value.elapsedMs = performance.now() - startedAt;
  return value;
}

async function seedFixtures() {
  const [stations] = await connection.query('SELECT id FROM stations ORDER BY id LIMIT 1');
  assert(stations.length === 1, 'The _load_test database has no station; run npm run db:init first.');
  const passwordHash = await bcrypt.hash(password, 10);
  const users = [];
  const bikes = [];
  for (let index = 0; index < requestCount; index += 1) {
    const suffix = String(index + 1).padStart(3, '0');
    const username = `${usernamePrefix}${suffix}`;
    const [userResult] = await connection.execute(
      `INSERT INTO users (username,password,name,role,status,language)
       VALUES (?, ?, ?, 'student', 'active', 'en')`,
      [username, passwordHash, `Load test ${suffix}`]
    );
    userIds.push(userResult.insertId);
    users.push({ username, password });

    const [bikeResult] = await connection.execute(
      `INSERT INTO bikes (bike_no,name,type,status,station_id,hourly_rate,description)
       VALUES (?, ?, 'standard', 'available', ?, 2.00, 'Synthetic load-test fixture')`,
      [`${bikePrefix}${suffix}`, `Load test bike ${suffix}`, stations[0].id]
    );
    bikeIds.push(bikeResult.insertId);
    bikes.push({ id: bikeResult.insertId, station_id: stations[0].id });
  }
  return { users, bikes, stationId: stations[0].id };
}

async function cleanup() {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill();
    await Promise.race([apiExit, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (apiProcess.exitCode === null) apiProcess.kill('SIGKILL');
  }
  if (!connection || connection.connection?._closing) return;
  try {
    await connection.beginTransaction();
    const conditions = [];
    const values = [];
    if (userIds.length) {
      conditions.push(`user_id IN (${userIds.map(() => '?').join(',')})`);
      values.push(...userIds);
    }
    if (bikeIds.length) {
      conditions.push(`bike_id IN (${bikeIds.map(() => '?').join(',')})`);
      values.push(...bikeIds);
    }
    if (conditions.length) await connection.execute(`DELETE FROM rental_orders WHERE ${conditions.join(' OR ')}`, values);
    if (bikeIds.length) await connection.execute(`DELETE FROM bikes WHERE id IN (${bikeIds.map(() => '?').join(',')})`, bikeIds);
    if (userIds.length) await connection.execute(`DELETE FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(`Synthetic fixture cleanup failed in ${database}: ${error.message}`);
  }
}

async function main() {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database,
    supportBigNumbers: true,
    bigNumberStrings: true
  });

  try {
    const fixtures = await seedFixtures();
    await startApi();

    const accounts = await runPhase('Login', fixtures.users.map((user) => timed(request('/auth/login', {
      method: 'POST',
      body: user
    }))), (response) => response.status === 200 && Boolean(response.payload?.data?.token));
    const tokens = accounts.map((data) => data.token);

    const orders = await runPhase('Concurrent rent', fixtures.bikes.map((bike, index) => timed(request('/orders/rent', {
      method: 'POST',
      token: tokens[index],
      body: { bike_id: bike.id, start_station_id: fixtures.stationId }
    }))), (response) => response.status === 200 && response.payload?.data?.status === 'renting');

    await runPhase('Concurrent return', orders.map((order, index) => timed(request(`/orders/${order.id}/return`, {
      method: 'PUT',
      token: tokens[index],
      body: { end_station_id: fixtures.stationId }
    }))), (response) => response.status === 200 && response.payload?.data?.status === 'completed');

    const [activeRows] = await connection.execute(
      `SELECT COUNT(*) AS count FROM rental_orders WHERE user_id IN (${userIds.map(() => '?').join(',')}) AND status='renting'`,
      userIds
    );
    const [bikeRows] = await connection.execute(
      `SELECT COUNT(*) AS count FROM bikes WHERE id IN (${bikeIds.map(() => '?').join(',')}) AND status='available'`,
      bikeIds
    );
    assert(Number(activeRows[0].count) === 0, 'active test orders remained after concurrent return');
    assert(Number(bikeRows[0].count) === requestCount, 'some test bikes were not restored to available status');
    console.log(`Integrity check passed: ${requestCount} orders completed, no active rentals remain.`);
  } finally {
    await cleanup();
    if (connection) await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
