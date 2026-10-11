import assert from 'node:assert/strict';
import test from 'node:test';
import migration from '../postgres/migrations/003_station_history_foreign_keys.js';
import oidcMigration from '../postgres/migrations/004_oidc_identity.js';

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

function createOidcConnection({ column = null, index = null } = {}) {
  const state = { column, index, statements: [] };
  return {
    state,
    async query(sql) {
      state.statements.push(sql);
      if (sql.includes('information_schema.columns')) return { rows: state.column ? [{ column_name: 'oidc_subject', data_type: state.column }] : [] };
      if (sql.includes('FROM pg_indexes')) return { rows: state.index ? [{ indexdef: state.index }] : [] };
      if (sql.startsWith('ALTER TABLE users ADD COLUMN')) state.column = 'text';
      if (sql.startsWith('CREATE UNIQUE INDEX')) state.index = 'CREATE UNIQUE INDEX uq_users_oidc_subject ON public.users USING btree (oidc_subject) WHERE (oidc_subject IS NOT NULL)';
      return { rows: [] };
    }
  };
}

test('OIDC identity migration adds a nullable subject and unique index once', async () => {
  const connection = createOidcConnection();
  await oidcMigration.up(connection);
  await oidcMigration.up(connection);
  assert.equal(connection.state.column, 'text');
  assert.equal(connection.state.statements.filter((sql) => sql.startsWith('ALTER TABLE')).length, 1);
  assert.equal(connection.state.statements.filter((sql) => sql.startsWith('CREATE UNIQUE INDEX')).length, 1);
});

test('OIDC identity migration rejects conflicting existing definitions', async () => {
  await assert.rejects(oidcMigration.up(createOidcConnection({ column: 'character varying' })), /unexpected type/);
  await assert.rejects(oidcMigration.up(createOidcConnection({
    column: 'text', index: 'CREATE INDEX uq_users_oidc_subject ON users (oidc_subject)'
  })), /unexpected definition/);
});
