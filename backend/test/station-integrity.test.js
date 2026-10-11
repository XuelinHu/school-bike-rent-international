import assert from 'node:assert/strict';
import test from 'node:test';
import migration from '../postgres/migrations/003_station_history_foreign_keys.js';

function createConnection({ orphanColumn, existing = [] } = {}) {
  const state = { constraints: new Map(existing.map((row) => [row.constraint, row])), statements: [] };
  return {
    state,
    async query(sql, params = []) {
      state.statements.push(sql);
      if (sql.includes('SELECT COUNT(*) AS count')) {
        const column = sql.match(/o\.(start_station_id|end_station_id)/)?.[1];
        return { rows: [{ count: column === orphanColumn ? 1 : 0 }] };
      }
      if (sql.includes('FROM pg_constraint')) {
        const row = state.constraints.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      const added = sql.match(/ADD CONSTRAINT (\S+)\s+FOREIGN KEY \((\S+)\)/);
      if (added) state.constraints.set(added[1], { column_name: added[2], confdeltype: 'r' });
      return { rows: [] };
    }
  };
}

test('PostgreSQL migration adds both station-history constraints and safely retries', async () => {
  const connection = createConnection();
  await migration.up(connection);
  await migration.up(connection);
  assert.equal(connection.state.constraints.size, 2);
  assert.equal(connection.state.statements.filter((sql) => sql.startsWith('ALTER TABLE')).length, 2);
});

test('station-history migration refuses orphan references before changing the schema', async () => {
  const connection = createConnection({ orphanColumn: 'start_station_id' });
  await assert.rejects(migration.up(connection), /start_station_id.*no matching station/);
  assert.equal(connection.state.statements.some((sql) => sql.startsWith('ALTER TABLE')), false);
});

test('station-history migration rejects an existing constraint with different behavior', async () => {
  const connection = createConnection({ existing: [
    { constraint: 'fk_orders_start_station', column_name: 'start_station_id', confdeltype: 'c' }
  ] });
  await assert.rejects(migration.up(connection), /unexpected definition/);
  assert.equal(connection.state.statements.some((sql) => sql.startsWith('ALTER TABLE')), false);
});
