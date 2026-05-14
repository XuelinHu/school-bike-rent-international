import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
const publicUserFields = 'id, username, name, email, phone, role, student_no, nationality, language, status, created_at';

router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, name, email, phone, student_no, nationality, language = 'zh-CN' } = req.body;
  if (!username || !password) throw new HttpError(400, 'Username and password are required');
  const hash = await bcrypt.hash(password, 10);
  await pool.execute(
    `INSERT INTO users (username, password, name, email, phone, role, student_no, nationality, language, status)
     VALUES (?, ?, ?, ?, ?, 'student', ?, ?, ?, 'active')`,
    [username, hash, name || username, email || null, phone || null, student_no || null, nationality || null, language]
  );
  ok(res, null, 'registered');
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await pool.execute(`SELECT * FROM users WHERE username = ? AND status = 'active'`, [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password))) {
    throw new HttpError(401, 'Invalid username or password');
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
  delete user.password;
  ok(res, { token, user });
}));

router.get('/profile', auth(), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`SELECT ${publicUserFields} FROM users WHERE id = ?`, [req.user.id]);
  ok(res, rows[0]);
}));

router.put('/profile', auth(), asyncHandler(async (req, res) => {
  const { name, email, phone, nationality, language } = req.body;
  await pool.execute(
    'UPDATE users SET name=?, email=?, phone=?, nationality=?, language=? WHERE id=?',
    [name, email, phone, nationality, language, req.user.id]
  );
  ok(res);
}));

router.put('/password', auth(), asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const [rows] = await pool.execute('SELECT password FROM users WHERE id=?', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(oldPassword || '', rows[0].password))) throw new HttpError(400, 'Old password is incorrect');
  await pool.execute('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(newPassword, 10), req.user.id]);
  ok(res);
}));

export default router;
