export async function runMigrations(connection, migrations, lockName) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  let locked = false;
  try {
    await connection.query("SELECT pg_advisory_lock(hashtext('school-bike-rent'), hashtext($1))", [lockName]);
    locked = true;

    const appliedRows = await connection.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.rows.map((row) => [row.version, row.checksum]));
    const knownVersions = new Set(migrations.map((migration) => migration.version));
    const unknownVersion = [...applied.keys()].find((version) => !knownVersions.has(version));
    if (unknownVersion) throw new Error(`Database contains unknown migration ${unknownVersion}`);
    if (knownVersions.size !== migrations.length) throw new Error('Migration versions must be unique');

    for (const migration of migrations) {
      const currentChecksum = applied.get(migration.version);
      if (currentChecksum !== undefined) {
        if (currentChecksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for ${migration.version}`);
        }
        continue;
      }

      await connection.query('BEGIN');
      try {
        if (typeof migration.up === 'function') await migration.up(connection);
        else await connection.query(migration.sql);
        await connection.query(
          'INSERT INTO schema_migrations (version, description, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.description, migration.checksum]
        );
        await connection.query('COMMIT');
        applied.set(migration.version, migration.checksum);
      } catch (error) {
        await connection.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }
  } finally {
    try {
      if (locked) await connection.query("SELECT pg_advisory_unlock(hashtext('school-bike-rent'), hashtext($1))", [lockName]);
    } finally {
      connection.release();
    }
  }
}
