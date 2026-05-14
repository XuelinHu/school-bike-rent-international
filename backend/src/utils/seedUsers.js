import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

const users = [
  ['admin', 'admin123456', 'System Admin', 'admin'],
  ['student', 'student123456', 'Demo Student', 'student'],
  ['staff', 'staff123456', 'Maintenance Staff', 'staff']
];

for (const [username, password, name, role] of users) {
  const hash = await bcrypt.hash(password, 10);
  await pool.execute(
    `INSERT INTO users (username,password,name,role,status,language)
     VALUES (?,?,?,?, 'active', 'zh-CN')
     ON DUPLICATE KEY UPDATE password=VALUES(password), name=VALUES(name), role=VALUES(role), status='active'`,
    [username, hash, name, role]
  );
}

console.log('Seed users completed.');
await pool.end();
