import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

if (!/_test$/i.test(process.env.DB_NAME || '')) {
  throw new Error('Concurrency tests require DB_NAME to end with _test.');
}

const baseUrl = (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 8032}/api`).replace(/\/$/, '');

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, payload: await response.json() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredPassword(name) {
  const password = process.env[name];
  if (!password) throw new Error(`${name} must be set for concurrency tests.`);
  return password;
}

async function main() {
  const login = await request('/auth/login', {
    method: 'POST',
    body: {
      username: process.env.SMOKE_USERNAME || 'student',
      password: requiredPassword('SMOKE_PASSWORD')
    }
  });
  const token = login.payload?.data?.token;
  assert(login.status === 200 && token, 'test account login failed; run `npm run seed:demo` first');

  const current = await request('/orders/current', { token });
  assert(current.status === 200 && !current.payload.data, 'test account already has an active rental');

  const bikes = await request('/bikes?status=available&page=1&pageSize=100');
  const candidates = bikes.payload?.data?.list?.slice(0, 2) || [];
  assert(bikes.status === 200 && candidates.length === 2, 'two available bikes are required; run `npm run seed:demo` first');

  const settled = await Promise.allSettled(candidates.map((bike) => request('/orders/rent', {
    method: 'POST', token,
    body: { bike_id: bike.id, start_station_id: bike.station_id }
  })));
  const attempts = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
  const created = attempts.filter((attempt) => attempt.status === 200 && attempt.payload?.data?.status === 'renting');

  try {
    assert(settled.every((item) => item.status === 'fulfilled'), 'a concurrent rent request failed at the transport layer');
    assert(created.length === 1, `expected one successful concurrent rental, got ${created.length}`);
    const rejected = attempts.filter((attempt) => attempt.status === 400);
    assert(rejected.length === 1, `expected one rejected concurrent rental, got ${rejected.length}`);

    const after = await request('/orders/current', { token });
    assert(after.status === 200 && after.payload.data?.id === created[0].payload.data.id, 'active rental state is inconsistent');

    const db = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    try {
      await db.beginTransaction();
      let constraintError;
      try {
        await db.execute(
          `INSERT INTO rental_orders (order_no,user_id,bike_id,start_time,hourly_rate,status,start_station_id)
           VALUES (?, ?, ?, NOW(), ?, 'renting', ?)`,
          [`RO-CONSTRAINT-PROBE-${Date.now()}`, created[0].payload.data.user_id, candidates[1].id,
            candidates[1].hourly_rate, candidates[1].station_id]
        );
      } catch (error) {
        constraintError = error;
      }
      await db.rollback();
      assert(
        constraintError?.code === 'ER_DUP_ENTRY'
          && constraintError.message.includes('uniq_rental_orders_active_user'),
        'database unique constraint did not reject a second active rental'
      );
    } finally {
      await db.end();
    }
  } finally {
    for (const attempt of created) {
      const order = attempt.payload.data;
      if (order?.id) {
        const returned = await request(`/orders/${order.id}/return`, {
          method: 'PUT', token,
          body: { end_station_id: order.start_station_id }
        });
        assert(returned.status === 200 && returned.payload?.data?.status === 'completed', 'failed to clean up test rental');
      }
    }
  }

  console.log('Concurrency test passed: concurrent rentals by one user produce exactly one active order.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
