import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

const env = process.env;
const host = env.PGHOST || '127.0.0.1';
if (env.NODE_ENV === 'production') throw new Error('Development login accounts are disabled in production.');
if (env.ALLOW_DEV_LOGIN_SEED !== '1') throw new Error('Set ALLOW_DEV_LOGIN_SEED=1 to seed local development accounts.');
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Development login accounts require a local PostgreSQL host.');

const students = Array.from({ length: 10 }, (_, index) => {
  const n = String(index + 1).padStart(2, '0');
  return {
    username: `student${n}`,
    password: `Student-${n}-Bike!2026`,
    name: `Test Student ${n}`,
    email: `student${n}@example.local`,
    phone: `13900000${n}`,
    studentNo: `DEV2026${n}`
  };
});

const admins = [
  { username: 'admin01', password: 'Admin-01-Bike!2026', name: 'Test Admin 01', email: 'admin01@example.local', phone: '13800000011' },
  { username: 'admin02', password: 'Admin-02-Bike!2026', name: 'Test Admin 02', email: 'admin02@example.local', phone: '13800000012' }
];

for (const account of [...students, ...admins]) {
  const hash = await bcrypt.hash(account.password, 10);
  const role = account.username.startsWith('admin') ? 'admin' : 'student';
  await pool.execute(
    `INSERT INTO users (username,password,name,email,phone,role,student_no,nationality,language,status)
     VALUES (?,?,?,?,?,?,?,'Development','en-US','active')
     ON CONFLICT (lower(username)) DO UPDATE SET password=EXCLUDED.password, name=EXCLUDED.name,
       email=EXCLUDED.email, phone=EXCLUDED.phone, role=EXCLUDED.role, student_no=EXCLUDED.student_no,
       language=EXCLUDED.language, status='active'`,
    [account.username, hash, account.name, account.email, account.phone, role, account.studentNo || null]
  );
}

console.log(`Seeded ${students.length} student and ${admins.length} admin development login accounts in ${env.PGDATABASE || 'student_bike_rental'}.`);
console.log('Student accounts:', students.map(({ username, password }) => `${username}/${password}`).join(', '));
console.log('Admin accounts:', admins.map(({ username, password }) => `${username}/${password}`).join(', '));
await pool.end();
