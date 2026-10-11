import dotenv from 'dotenv';

dotenv.config();

if (!/_test$/i.test(process.env.PGDATABASE || '')) {
  throw new Error('Smoke tests require PGDATABASE to end with _test.');
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

function requiredPassword(name) {
  const password = process.env[name];
  if (!password) throw new Error(`${name} must be set for smoke tests.`);
  return password;
}

async function checkPagedList(label, path, token) {
  const first = await request(`${path}${path.includes('?') ? '&' : '?'}page=1&pageSize=1`, { token });
  const data = first.data;
  assert(
    first.status === 200
      && Array.isArray(data?.list)
      && Number.isFinite(data.total)
      && data.page === 1
      && data.pageSize === 1
      && data.list.length <= data.pageSize,
    `${label} pagination envelope failed`
  );

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (totalPages > 1) {
    const second = await request(`${path}${path.includes('?') ? '&' : '?'}page=2&pageSize=1`, { token });
    assert(
      second.status === 200
        && Array.isArray(second.data?.list)
        && second.data.page === 2
        && second.data.list.length === 1
        && data.list[0]?.id !== second.data.list[0]?.id,
      `${label} second page failed or repeated the first page`
    );
  }
}

async function main() {
  const health = await request('/health');
  assert(health.status === 200 && health.data?.status === 'ok', 'health check failed');

  const login = await request('/auth/login', {
    method: 'POST',
    body: {
      username: process.env.SMOKE_USERNAME || 'student',
      password: requiredPassword('SMOKE_PASSWORD')
    }
  });
  assert(login.status === 200 && login.data?.token, 'test account login failed; run `npm run seed:demo` first');
  const token = login.data.token;

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: {
      username: process.env.SMOKE_ADMIN_USERNAME || 'admin',
      password: requiredPassword('SMOKE_ADMIN_PASSWORD')
    }
  });
  assert(adminLogin.status === 200 && adminLogin.data?.token, 'admin test account login failed');
  const adminToken = adminLogin.data.token;

  for (const [label, path, bearer] of [
    ['bikes', '/bikes', token],
    ['stations', '/stations', token],
    ['published announcements', '/announcements', token],
    ['personal orders', '/orders/my', token],
    ['users', '/users', adminToken],
    ['admin orders', '/orders', adminToken],
    ['maintenance records', '/maintenance', adminToken]
  ]) {
    await checkPagedList(label, path, bearer);
  }

  const bikePage = await request('/bikes?page=1&pageSize=2');
  assert(
    bikePage.status === 200 && bikePage.data?.page === 1 && bikePage.data.pageSize === 2 && bikePage.data.list?.length <= 2,
    'bike pagination contract failed'
  );
  const bikeSearch = await request('/bikes?keyword=BIKE-1001&page=1&pageSize=5');
  const bike = bikeSearch.data?.list?.find((row) => row.bike_no === 'BIKE-1001' && row.status === 'available');
  assert(bike, 'available smoke bike BIKE-1001 not found; run `npm run seed:demo` first');

  const stationName = `SMOKE-STATION-${Date.now()}`;
  const stationCreated = await request('/stations', {
    method: 'POST', token: adminToken,
    body: { name_zh: stationName, name_en: stationName, capacity: 1 }
  });
  assert(stationCreated.status === 200, 'smoke station creation failed');
  const stationPage = await request(`/stations?keyword=${encodeURIComponent(stationName)}&page=1&pageSize=5`);
  const smokeStation = stationPage.data?.list?.find((station) => station.name_en === stationName);
  assert(smokeStation, 'smoke station was not found after creation');

  const current = await request('/orders/current', { token });
  assert(current.status === 200 && !current.data, 'test account already has an active rental');
  let order;
  try {
    const rent = await request('/orders/rent', {
      method: 'POST', token,
      body: { bike_id: bike.id, start_station_id: smokeStation.id }
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
        body: { end_station_id: smokeStation.id }
      });
      assert(returned.status === 200 && returned.data?.status === 'completed', 'rental return failed');
    }
  }

  const bikeRestored = await request(`/bikes/${bike.id}`, {
    method: 'PUT', token: adminToken,
    body: { station_id: bike.station_id }
  });
  assert(bikeRestored.status === 200, 'smoke bike could not be moved back to its original station');

  const deleteStation = await request(`/stations/${smokeStation.id}`, { method: 'DELETE', token: adminToken });
  assert(deleteStation.status === 409, 'station referenced by rental history was not protected');

  console.log('Smoke test passed: health, student/admin login, seven paginated collections, rent, order history, return, and station-history deletion protection.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
