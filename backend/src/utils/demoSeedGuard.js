const SAFE_DATABASE_SUFFIX = /_(?:dev|test|demo)$/i;
const PASSWORD_ENV = {
  admin: 'SEED_ADMIN_PASSWORD',
  student: 'SEED_STUDENT_PASSWORD',
  staff: 'SEED_STAFF_PASSWORD'
};

export function assertDemoSeedAllowed(env = process.env) {
  if (env.ALLOW_DEMO_SEED !== '1') {
    throw new Error('Demo seeding requires ALLOW_DEMO_SEED=1.');
  }
  if (!SAFE_DATABASE_SUFFIX.test(env.PGDATABASE || '')) {
    throw new Error('Demo seeding is restricted to databases ending in _dev, _test, or _demo.');
  }

  const passwords = Object.fromEntries(Object.entries(PASSWORD_ENV).map(([role, name]) => {
    const password = env[name];
    if (typeof password !== 'string' || password.length < 16) {
      throw new Error(`${name} must contain at least 16 characters.`);
    }
    return [role, password];
  }));

  if (new Set(Object.values(passwords)).size !== Object.keys(passwords).length) {
    throw new Error('Demo role passwords must be different.');
  }

  return passwords;
}
