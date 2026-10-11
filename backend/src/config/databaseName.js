export function assertDatabaseName(name) {
  if (!/^[A-Za-z0-9_]{1,63}$/.test(name)) {
    throw new Error('PGDATABASE may contain only letters, numbers, and underscores (up to 63 characters)');
  }
  return name;
}
