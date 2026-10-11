export function assertDatabaseName(name) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) {
    throw new Error('DB_NAME may contain only letters, numbers, and underscores (up to 64 characters)');
  }
  return name;
}
