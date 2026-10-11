import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, link, mkdir, mkdtemp, open, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const PROJECT = 'school-bike-rent-international';
const MAGIC = Buffer.from('SBRPG001');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_METADATA_BYTES = 4096;

export function parseBackupKey(value) {
  if (!/^[\da-f]{64}$/i.test(String(value || ''))) {
    throw new Error('DB_BACKUP_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.');
  }
  return Buffer.from(value, 'hex');
}

export function validateDatabaseName(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/i.test(String(value || ''))) {
    throw new Error('PostgreSQL database name is not a safe identifier.');
  }
  return value;
}

export function assertSafeRestoreTarget({ targetDatabase, sourceDatabase, replace }) {
  validateDatabaseName(targetDatabase);
  validateDatabaseName(sourceDatabase);
  if (targetDatabase === sourceDatabase) throw new Error('Restore target must differ from the source database.');
  if (!targetDatabase.endsWith('_test')) throw new Error('Restore target must end in _test.');
  if (replace !== true) throw new Error('Restore requires explicit --replace confirmation.');
}

function makeHeader(metadata, nonce) {
  const metadataBytes = Buffer.from(JSON.stringify(metadata));
  if (metadataBytes.length > MAX_METADATA_BYTES) throw new Error('Backup metadata is too large.');
  const prefix = Buffer.alloc(MAGIC.length + 4 + metadataBytes.length + NONCE_BYTES + TAG_BYTES);
  MAGIC.copy(prefix);
  prefix.writeUInt32BE(metadataBytes.length, MAGIC.length);
  metadataBytes.copy(prefix, MAGIC.length + 4);
  nonce.copy(prefix, MAGIC.length + 4 + metadataBytes.length);
  return { prefix, metadataBytes, tagOffset: prefix.length - TAG_BYTES };
}

export async function encryptArchiveFile(sourcePath, destinationPath, metadata, key) {
  const nonce = randomBytes(NONCE_BYTES);
  const { prefix, metadataBytes, tagOffset } = makeHeader(metadata, nonce);
  const partialPath = `${destinationPath}.${process.pid}.${randomBytes(6).toString('hex')}.partial`;
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.concat([MAGIC, metadataBytes]));
  try {
    await writeFile(partialPath, prefix, { flag: 'wx', mode: 0o600 });
    await pipeline(createReadStream(sourcePath), cipher, createWriteStream(partialPath, { flags: 'a', mode: 0o600 }));
    const handle = await open(partialPath, 'r+');
    try {
      await handle.write(cipher.getAuthTag(), 0, TAG_BYTES, tagOffset);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(partialPath, destinationPath);
  } finally {
    await unlink(partialPath).catch(() => {});
  }
}

async function readHeader(sourcePath) {
  const handle = await open(sourcePath, 'r');
  try {
    const fixed = Buffer.alloc(MAGIC.length + 4);
    const fixedRead = await handle.read(fixed, 0, fixed.length, 0);
    if (fixedRead.bytesRead !== fixed.length || !fixed.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Unsupported or invalid PostgreSQL backup format.');
    }
    const metadataLength = fixed.readUInt32BE(MAGIC.length);
    if (metadataLength < 2 || metadataLength > MAX_METADATA_BYTES) throw new Error('Invalid backup metadata length.');
    const metadataBytes = Buffer.alloc(metadataLength);
    const nonce = Buffer.alloc(NONCE_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);
    let offset = fixed.length;
    for (const [buffer, size] of [[metadataBytes, metadataLength], [nonce, NONCE_BYTES], [tag, TAG_BYTES]]) {
      const result = await handle.read(buffer, 0, size, offset);
      if (result.bytesRead !== size) throw new Error('Backup file is truncated.');
      offset += size;
    }
    let metadata;
    try { metadata = JSON.parse(metadataBytes.toString('utf8')); } catch { throw new Error('Invalid backup metadata.'); }
    return { metadata, metadataBytes, nonce, tag, offset };
  } finally {
    await handle.close();
  }
}

export async function decryptArchiveFile(sourcePath, targetDirectory, key, expectedProject = PROJECT) {
  const { metadata, metadataBytes, nonce, tag, offset } = await readHeader(sourcePath);
  if (metadata?.format !== 1 || metadata?.project !== expectedProject) {
    throw new Error('Backup belongs to another project or uses an unsupported version.');
  }
  validateDatabaseName(metadata.database);
  const directory = await mkdtemp(join(targetDirectory, `${PROJECT}-restore-`));
  await chmod(directory, 0o700).catch(() => {});
  const archivePath = join(directory, 'restore.dump');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.concat([MAGIC, metadataBytes]));
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(sourcePath, { start: offset }), decipher, createWriteStream(archivePath, { flags: 'wx', mode: 0o600 }));
    return { archivePath, directory, metadata };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (/authenticate data|bad decrypt/i.test(error.message)) throw new Error('Backup authentication failed; restore was not started.');
    throw error;
  }
}

function parseArgs(argv) {
  const [action, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === '--replace') options.replace = true;
    else if (item === '--help') options.help = true;
    else if (item.startsWith('--')) {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}.`);
      options[item.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${item}.`);
  }
  return { action, options };
}

function postgresEnv(env, database = env.PGDATABASE) {
  let host = env.PGHOST;
  let port = env.PGPORT || '5432';
  let user = env.PGUSER;
  let password = env.PGPASSWORD;
  let sslmode = env.PGSSL === '1' ? 'require' : 'prefer';
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
    host = decodeURIComponent(url.hostname);
    port = url.port || port;
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    sslmode = url.searchParams.get('sslmode') || sslmode;
  }
  if (!host || !user || typeof password !== 'string' || password.length === 0) {
    throw new Error('Set PGHOST, PGUSER, PGPASSWORD (or DATABASE_URL) for PostgreSQL backup/restore.');
  }
  if (!/^\d{1,5}$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('PGPORT is invalid.');
  return {
    ...process.env,
    PGHOST: host,
    PGPORT: String(port),
    PGUSER: user,
    PGPASSWORD: password,
    PGDATABASE: validateDatabaseName(database),
    PGSSLMODE: sslmode
  };
}

function runTool(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', (error) => reject(new Error(`${basename(command)} could not start: ${error.message}`)));
    child.on('close', (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`${basename(command)} failed with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}`)));
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function runCli(argv, env = process.env) {
  const { action, options } = parseArgs(argv);
  if (options.help || action === '--help' || !action) {
    console.log('Usage: npm run db:backup [-- --destination <file>]');
    console.log('       npm run db:restore -- --source <file> --database <name_test> --replace');
    return;
  }
  const key = parseBackupKey(env.DB_BACKUP_ENCRYPTION_KEY);
  if (action === 'backup') {
    const database = validateDatabaseName(env.PGDATABASE);
    const pgEnv = postgresEnv(env, database);
    const destination = resolve(options.destination || join('backups', `student-bike-rental-${database}-${timestamp()}.pgbak`));
    await mkdir(dirname(destination), { recursive: true });
    const tempDirectory = await mkdtemp(join(tmpdir(), `${PROJECT}-dump-`));
    const dumpPath = join(tempDirectory, 'database.dump');
    await chmod(tempDirectory, 0o700).catch(() => {});
    try {
      await runTool('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dumpPath], pgEnv);
      await encryptArchiveFile(dumpPath, destination, {
        format: 1, project: PROJECT, database, createdAt: new Date().toISOString()
      }, key);
      console.log(`Encrypted PostgreSQL backup created: ${destination}`);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (action === 'restore') {
    if (!options.source || !options.database || !options.replace) {
      throw new Error('restore requires --source, --database, and explicit --replace.');
    }
    const targetDatabase = validateDatabaseName(options.database);
    if (!targetDatabase.endsWith('_test')) throw new Error('Restore target must end in _test.');
    const { archivePath, directory, metadata } = await decryptArchiveFile(resolve(options.source), tmpdir(), key);
    try {
      assertSafeRestoreTarget({ targetDatabase, sourceDatabase: metadata.database, replace: options.replace });
      const pgEnv = postgresEnv(env, targetDatabase);
      await runTool('pg_restore', ['--list', archivePath], pgEnv);
      await runTool('pg_restore', [
        '--exit-on-error', '--single-transaction', '--clean', '--if-exists', '--no-owner', '--no-acl',
        '--dbname', targetDatabase, archivePath
      ], pgEnv);
      console.log(`Restored ${metadata.database} snapshot to isolated database ${targetDatabase}.`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    return;
  }
  throw new Error(`Unknown action: ${action}.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
