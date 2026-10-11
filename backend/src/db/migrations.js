export async function runMigrations(connection, migrations, lockName) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  let locked = false;
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    if (Number(lockRows[0]?.acquired) !== 1) throw new Error('Timed out waiting for the database migration lock');
    locked = true;

    const [appliedRows] = await connection.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
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

      if (typeof migration.up === 'function') await migration.up(connection);
      else await connection.query(migration.sql);
      await connection.query(
        'INSERT INTO schema_migrations (version, description, checksum) VALUES (?, ?, ?)',
        [migration.version, migration.description, migration.checksum]
      );
    }
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally {
      connection.release();
    }
  }
}
