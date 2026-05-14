import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';

const router = Router();
router.use(auth(), allow('admin'));

router.get('/', asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute('SELECT id,username,name,email,phone,role,student_no,nationality,language,status,created_at FROM users ORDER BY id DESC');
  ok(res, rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT id,username,name,email,phone,role,student_no,nationality,language,status,created_at FROM users WHERE id=?', [req.params.id]);
  ok(res, rows[0] || null);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, email, phone, role, student_no, nationality, language, status, password } = req.body;
  if (password) {
    await pool.execute(
      'UPDATE users SET password=?, name=?, email=?, phone=?, role=?, student_no=?, nationality=?, language=?, status=? WHERE id=?',
      [await bcrypt.hash(password, 10), name, email, phone, role, student_no, nationality, language, status, req.params.id]
    );
  } else {
    await pool.execute(
      'UPDATE users SET name=?, email=?, phone=?, role=?, student_no=?, nationality=?, language=?, status=? WHERE id=?',
      [name, email, phone, role, student_no, nationality, language, status, req.params.id]
    );
  }
  ok(res);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await pool.execute(`UPDATE users SET status='disabled' WHERE id=?`, [req.params.id]);
  ok(res);
}));

export default router;
