import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertSafeRestoreTarget,
  decryptArchiveFile,
  encryptArchiveFile,
  parseBackupKey,
  validateDatabaseName
} from '../scripts/pg-backup.mjs';

const key = Buffer.alloc(32, 9);

test('PostgreSQL backup key and database identifiers are validated', () => {
  assert.equal(parseBackupKey(key.toString('hex')).length, 32);
  assert.throws(() => parseBackupKey('short'), /64 hexadecimal/);
  assert.equal(validateDatabaseName('bike_test'), 'bike_test');
  assert.throws(() => validateDatabaseName('not-safe-name'), /safe identifier/);
});

test('restore requires a distinct _test target and explicit replace', () => {
  assert.doesNotThrow(() => assertSafeRestoreTarget({
    sourceDatabase: 'bike_prod', targetDatabase: 'bike_restore_test', replace: true
  }));
  assert.throws(() => assertSafeRestoreTarget({
    sourceDatabase: 'bike_prod', targetDatabase: 'bike_prod', replace: true
  }), /differ from the source/);
  assert.throws(() => assertSafeRestoreTarget({
    sourceDatabase: 'bike_prod', targetDatabase: 'bike_restore', replace: true
  }), /end in _test/);
  assert.throws(() => assertSafeRestoreTarget({
    sourceDatabase: 'bike_prod', targetDatabase: 'bike_restore_test', replace: false
  }), /explicit --replace/);
});

test('encrypted custom archives authenticate, round-trip, and never overwrite', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bike-pg-backup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source.dump');
  const encrypted = join(directory, 'snapshot.pgbak');
  await writeFile(source, Buffer.from('synthetic PostgreSQL custom archive payload'));
  await encryptArchiveFile(source, encrypted, {
    format: 1, project: 'school-bike-rent-international', database: 'bike_source_test', createdAt: '2026-01-01T00:00:00.000Z'
  }, key);
  await assert.rejects(encryptArchiveFile(source, encrypted, {
    format: 1, project: 'school-bike-rent-international', database: 'bike_source_test'
  }, key), { code: 'EEXIST' });

  const decrypted = await decryptArchiveFile(encrypted, directory, key);
  try {
    assert.equal(decrypted.metadata.database, 'bike_source_test');
    assert.deepEqual(await readFile(decrypted.archivePath), await readFile(source));
  } finally {
    await rm(decrypted.directory, { recursive: true, force: true });
  }

  const bytes = await readFile(encrypted);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(encrypted, bytes);
  await assert.rejects(decryptArchiveFile(encrypted, directory, key), /authentication failed/);
});

test('encrypted backup is bound to this project', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bike-pg-backup-project-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source.dump');
  const encrypted = join(directory, 'snapshot.pgbak');
  await writeFile(source, 'archive');
  await encryptArchiveFile(source, encrypted, {
    format: 1, project: 'other-project', database: 'source_test'
  }, key);
  await assert.rejects(decryptArchiveFile(encrypted, directory, key), /another project/);
});
