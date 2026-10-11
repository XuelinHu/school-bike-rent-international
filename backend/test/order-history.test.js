import assert from 'node:assert/strict';
import test from 'node:test';
import { getMyOrderPage } from '../src/services/orderHistory.js';

test('my order page scopes both queries to the authenticated user and applies bounded paging', async () => {
  const calls = [];
  const executor = {
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: '27' }]];
      return [[{ id: 17, user_id: 'user-7' }]];
    }
  };

  const result = await getMyOrderPage(executor, 'user-7', { page: '2', pageSize: '10' });

  assert.deepEqual(result, {
    list: [{ id: 17, user_id: 'user-7' }], total: 27, page: 2, pageSize: 10
  });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.sql, /o\.user_id = \?/);
    assert.deepEqual(call.params, ['user-7']);
  }
  assert.match(calls[1].sql, /ORDER BY o\.id DESC LIMIT 10 OFFSET 10/);
  assert.doesNotMatch(calls[1].sql, /LIMIT \?/);
});
