import dotenv from 'dotenv';

dotenv.config();

if (!/_test$/i.test(process.env.DB_NAME || '')) {
  throw new Error('Smoke tests require DB_NAME to end with _test.');
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
  const payload = await response.json();
  return { status: response.status, data: payload.data, message: payload.message };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const health = await request('/health');
  assert(health.status === 200 && health.data?.status === 'ok', 'health check failed');

  const login = await request('/auth/login', {
    method: 'POST',
    body: {
      username: process.env.SMOKE_USERNAME || 'student',
      password: process.env.SMOKE_PASSWORD || 'student123456'
    }
  });
  assert(login.status === 200 && login.data?.token, 'test account login failed; run `npm run seed:demo` first');
  const token = login.data.token;

  const bikePage = await request('/bikes?page=1&pageSize=2');
  assert(
    bikePage.status === 200 && bikePage.data?.page === 1 && bikePage.data.pageSize === 2 && bikePage.data.list?.length <= 2,
    'bike pagination contract failed'
  );
  const bikeSearch = await request('/bikes?keyword=BIKE-1001&page=1&pageSize=5');
  const bike = bikeSearch.data?.list?.find((row) => row.bike_no === 'BIKE-1001' && row.status === 'available');
  assert(bike, 'available smoke bike BIKE-1001 not found; run `npm run seed:demo` first');

  const current = await request('/orders/current', { token });
  assert(current.status === 200 && !current.data, 'test account already has an active rental');
  let order;
  try {
    const rent = await request('/orders/rent', {
      method: 'POST', token,
      body: { bike_id: bike.id, start_station_id: bike.station_id }
    });
    assert(rent.status === 200 && rent.data?.status === 'renting', 'rental creation failed');
    order = rent.data;

    const orderPage = await request('/orders/my?page=1&pageSize=10', { token });
    assert(
      orderPage.status === 200 && orderPage.data?.page === 1 && orderPage.data.list?.some((row) => row.id === order.id),
      'authenticated paginated order history failed'
    );

    const anonymous = await request('/orders/my?page=1&pageSize=10');
    assert(anonymous.status === 401, 'anonymous order history request was not rejected');
  } finally {
    if (order?.id) {
      const returned = await request(`/orders/${order.id}/return`, {
        method: 'PUT', token,
        body: { end_station_id: bike.station_id }
      });
      assert(returned.status === 200 && returned.data?.status === 'completed', 'rental return failed');
    }
  }

  console.log('Smoke test passed: health, login, bike pagination, rent, paginated order history, return, and anonymous access rejection.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
