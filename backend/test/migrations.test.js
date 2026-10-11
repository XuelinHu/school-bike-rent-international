import assert from 'node:assert/strict';
import test from 'node:test';
import { runMigrations } from '../src/db/migrations.js';
import { assertDatabaseName } from '../src/config/databaseName.js';
import { assertDemoSeedAllowed } from '../src/utils/demoSeedGuard.js';

function createHarness({ lockAcquired = 1, applied = [] } = {}) {
  let released = false;
  const state = { applied, released: () => released, statements: [] };
  const connection = {
    async query(sql, params = []) {
      state.statements.push(sql);
      if (sql.includes('GET_LOCK')) return [[{ acquired: lockAcquired }]];
      if (sql.includes('RELEASE_LOCK')) {
        released = true;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT version, checksum')) return [state.applied];
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        state.applied.push({ version: params[0], checksum: params[2] });
        return [{ affectedRows: 1 }];
      }
      if (sql === 'BROKEN DDL') throw new Error('DDL failed');
      return [{ affectedRows: 0 }];
    },
    release() {}
  };
  state.connection = connection;
  return state;
}

const migration = { version: '001_initial_schema', description: 'initial', checksum: 'a'.repeat(64), sql: 'CREATE TABLE bikes' };

test('database names are safe SQL identifiers', () => {
  assert.equal(assertDatabaseName('student_bike_rental_test'), 'student_bike_rental_test');
  for (const invalid of ['student-bike-rental', 'x`; DROP DATABASE app;--', 'a'.repeat(65), '']) {
    assert.throws(() => assertDatabaseName(invalid), /DB_NAME may contain only/);
  }
});

test('demo seeding requires explicit opt-in, an isolated database, and distinct strong passwords', () => {
  const env = {
    ALLOW_DEMO_SEED: '1',
    DB_NAME: 'student_bike_rental_test',
    SEED_ADMIN_PASSWORD: 'Admin-Password-2026!A',
    SEED_STUDENT_PASSWORD: 'Student-Password-2026!B',
    SEED_STAFF_PASSWORD: 'Staff-Password-2026!C'
  };
  assert.deepEqual(assertDemoSeedAllowed(env), {
    admin: env.SEED_ADMIN_PASSWORD,
    student: env.SEED_STUDENT_PASSWORD,
    staff: env.SEED_STAFF_PASSWORD
  });
  assert.throws(() => assertDemoSeedAllowed({ ...env, ALLOW_DEMO_SEED: '0' }), /ALLOW_DEMO_SEED/);
  assert.throws(() => assertDemoSeedAllowed({ ...env, DB_NAME: 'student_bike_rental' }), /restricted/);
  assert.throws(() => assertDemoSeedAllowed({ ...env, SEED_ADMIN_PASSWORD: 'too-short' }), /at least 16/);
  assert.throws(() => assertDemoSeedAllowed({ ...env, SEED_STAFF_PASSWORD: env.SEED_ADMIN_PASSWORD }), /different/);
});

test('migration runner records once and skips an unchanged version', async () => {
  const state = createHarness();
  await runMigrations(state.connection, [migration], 'bike-rental-test');
  await runMigrations(state.connection, [migration], 'bike-rental-test');
  assert.equal(state.applied.length, 1);
  assert.equal(state.statements.filter((sql) => sql === migration.sql).length, 1);
  assert.equal(state.released(), true);
});

test('migration runner executes JavaScript migration callbacks', async () => {
  const state = createHarness();
  const jsMigration = {
    version: '002_js_migration', description: 'callback migration', checksum: 'd'.repeat(64),
    async up(connection) { await connection.query('CALLBACK DDL'); }
  };
  await runMigrations(state.connection, [jsMigration], 'bike-rental-test');
  assert.ok(state.statements.includes('CALLBACK DDL'));
  assert.equal(state.applied[0].version, jsMigration.version);
});

test('failed DDL leaves no ledger record and releases the advisory lock', async () => {
  const state = createHarness();
  await assert.rejects(
    runMigrations(state.connection, [{ ...migration, sql: 'BROKEN DDL' }], 'bike-rental-test'),
    /DDL failed/
  );
  assert.equal(state.applied.length, 0);
  assert.equal(state.released(), true);
});

test('migration checksum drift, unknown versions, duplicates, and lock timeouts fail closed', async () => {
  const drift = createHarness({ applied: [{ version: migration.version, checksum: 'b'.repeat(64) }] });
  await assert.rejects(runMigrations(drift.connection, [migration], 'bike-rental-test'), /checksum mismatch/);

  const unknown = createHarness({ applied: [{ version: '999_future', checksum: 'c'.repeat(64) }] });
  await assert.rejects(runMigrations(unknown.connection, [migration], 'bike-rental-test'), /unknown migration/);

  const duplicate = createHarness();
  await assert.rejects(runMigrations(duplicate.connection, [migration, migration], 'bike-rental-test'), /must be unique/);

  const timeout = createHarness({ lockAcquired: 0 });
  await assert.rejects(runMigrations(timeout.connection, [migration], 'bike-rental-test'), /Timed out/);
  assert.equal(timeout.released(), false);
});
