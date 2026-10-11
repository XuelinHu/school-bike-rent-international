import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadMigrations(root, database) {
  if (!/^[A-Za-z0-9_]{1,63}$/.test(database)) {
    throw new Error('PGDATABASE may contain only letters, numbers, and underscores (up to 63 characters).');
  }

  const schema = await fs.readFile(path.join(root, 'postgres', 'schema.sql'), 'utf8');
  const migrationDir = path.join(root, 'postgres', 'migrations');
  const migrationFiles = await fs.readdir(migrationDir);
  const migrations = [{
    version: '001_initial_schema',
    description: 'Initial student bike rental PostgreSQL schema',
    sql: schema,
    checksum: createHash('sha256').update(schema).digest('hex')
  }];

  for (const file of migrationFiles.filter((name) => /\.js$/i.test(name)).sort()) {
    const match = /^(\d{3,}_[a-z0-9_]+)\.js$/i.exec(file);
    if (!match) throw new Error(`Invalid PostgreSQL migration filename: ${file}`);
    const source = await fs.readFile(path.join(migrationDir, file), 'utf8');
    const module = await import(pathToFileURL(path.join(migrationDir, file)).href);
    const definition = module.default;
    if (definition?.id !== match[1] || typeof definition.up !== 'function') {
      throw new Error(`Migration id/up mismatch in ${file}`);
    }
    migrations.push({
      ...definition,
      version: definition.id,
      checksum: createHash('sha256').update(source).digest('hex')
    });
  }

  const lockName = createHash('sha256').update(database).digest('hex').slice(0, 32);
  return { migrations, lockName };
}
