import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { assertDemoSeedAllowed } from './demoSeedGuard.js';

const passwords = assertDemoSeedAllowed();
const users = [
  ['admin', passwords.admin, 'System Admin', 'admin'],
  ['student', passwords.student, 'Demo Student', 'student'],
  ['staff', passwords.staff, 'Maintenance Staff', 'staff']
];

for (const [username, password, name, role] of users) {
  const hash = await bcrypt.hash(password, 10);
  await pool.execute(
    `INSERT INTO users (username,password,name,role,status,language)
     VALUES (?,?,?,?, 'active', 'zh-CN')
     ON CONFLICT (lower(username)) DO UPDATE SET password=EXCLUDED.password, name=EXCLUDED.name, role=EXCLUDED.role, status='active'`,
    [username, hash, name, role]
  );
}

console.log('Seed users completed.');
await pool.end();
