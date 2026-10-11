import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOrderBy,
  escapeLike,
  paginateRows,
  parsePaging,
  whereBuilder,
} from '../src/utils/paginate.js';

test('paging defaults, clamps size, and bounds the offset', () => {
  assert.deepEqual(parsePaging(), { page: 1, pageSize: 10, offset: 0 });
  assert.deepEqual(parsePaging({ page: '-8', pageSize: '1000' }), {
    page: 1, pageSize: 100, offset: 0,
  });
  const largePage = parsePaging({ page: '2147483647', pageSize: '100' });
  assert.ok(largePage.offset <= 2 ** 31 - 1);
});

test('LIKE search escapes metacharacters and truncates input', () => {
  assert.equal(escapeLike(' 50%_\\done '), '50\\%\\_\\\\done');
  assert.equal(escapeLike('abcdef', { maxLength: 3 }), 'abc');
});

test('ORDER BY accepts only whitelisted columns', () => {
  const columns = { created: 'orders.created_at', id: 'orders.id' };
  assert.equal(buildOrderBy('-created', columns), 'orders.created_at DESC');
  assert.equal(buildOrderBy('created', columns), 'orders.created_at ASC');
  assert.equal(buildOrderBy('created; DROP TABLE users', columns, 'orders.id DESC'), 'orders.id DESC');
});

test('where builder skips empty optional values while preserving parameter order', () => {
  const query = whereBuilder()
    .add('status = ?', 'active')
    .addIf('', 'name LIKE ?', '%ignored%')
    .addIf('ada', 'name LIKE ?', '%ada%')
    .build();
  assert.deepEqual(query, {
    where: ['status = ?', 'name LIKE ?'],
    params: ['active', '%ada%'],
  });
});

test('paginated query uses safe inline bounds and returns total metadata', async () => {
  const calls = [];
  const executor = {
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: '25' }]];
      return [[{ id: 21 }]];
    },
  };
  const result = await paginateRows(executor, {
    select: 'id',
    from: 'orders',
    where: ['user_id = ?'],
    params: ['user-1'],
    orderBy: 'id DESC',
    page: 3,
    pageSize: 10,
  });

  assert.deepEqual(result, {
    list: [{ id: 21 }], total: 25, page: 3, pageSize: 10,
  });
  assert.deepEqual(calls[0].params, ['user-1']);
  assert.deepEqual(calls[1].params, ['user-1']);
  assert.match(calls[1].sql, /LIMIT 10 OFFSET 20/);
  assert.doesNotMatch(calls[1].sql, /LIMIT \?/);
});
