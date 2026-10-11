import assert from 'node:assert/strict';
import test from 'node:test';
import migration from '../sql/migrations/003_station_history_foreign_keys.js';

function createConnection({ orphanColumn, foreignKeys = [] } = {}) {
  const state = { foreignKeys: [...foreignKeys], statements: [] };
  return {
    state,
    async query(sql) {
      state.statements.push(sql);
      if (sql.includes('LEFT JOIN stations')) {
        const column = sql.match(/o\.(start_station_id|end_station_id)/)?.[1];
        return [[{ count: column === orphanColumn ? 1 : 0 }]];
      }
      if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [state.foreignKeys];
      const added = sql.match(/ADD CONSTRAINT (\S+)\s+FOREIGN KEY \((\S+)\) REFERENCES (\S+)\((\S+)\) ON DELETE (\S+)/);
      if (added) {
        state.foreignKeys.push({
          constraint_name: added[1],
          column_name: added[2],
          referenced_table: added[3],
          referenced_column: added[4],
          delete_rule: added[5],
        });
      }
      return [{ affectedRows: 0 }];
    },
  };
}

test('station history migration adds both RESTRICT foreign keys and safely retries partial DDL', async () => {
  const connection = createConnection();
  assert.deepEqual(await migration.up(connection), ['fk_orders_start_station', 'fk_orders_end_station']);
  assert.deepEqual(await migration.up(connection), []);
  assert.equal(connection.state.statements.filter((sql) => sql.startsWith('ALTER TABLE')).length, 2);
});

test('station history migration refuses orphan references before changing the schema', async () => {
  const connection = createConnection({ orphanColumn: 'start_station_id' });
  await assert.rejects(migration.up(connection), /start_station_id.*no matching station/);
  assert.equal(connection.state.statements.some((sql) => sql.startsWith('ALTER TABLE')), false);
});

test('station history migration rejects an existing foreign key with different behavior', async () => {
  const connection = createConnection({ foreignKeys: [{
    column_name: 'start_station_id',
    referenced_table: 'stations',
    referenced_column: 'id',
    delete_rule: 'CASCADE',
  }] });
  await assert.rejects(migration.up(connection), /unexpected foreign key definition/);
  assert.equal(connection.state.statements.some((sql) => sql.startsWith('ALTER TABLE')), false);
});
