import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute(`SELECT * FROM announcements WHERE status='published' ORDER BY id DESC`);
  ok(res, rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM announcements WHERE id=?', [req.params.id]);
  ok(res, rows[0] || null);
}));

router.post('/', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { title_zh, title_en, content_zh, content_en, status = 'published' } = req.body;
  await pool.execute(
    'INSERT INTO announcements (title_zh,title_en,content_zh,content_en,status,created_by) VALUES (?,?,?,?,?,?)',
    [title_zh, title_en, content_zh, content_en, status, req.user.id]
  );
  ok(res);
}));

router.put('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { title_zh, title_en, content_zh, content_en, status = 'published' } = req.body;
  await pool.execute(
    'UPDATE announcements SET title_zh=?, title_en=?, content_zh=?, content_en=?, status=? WHERE id=?',
    [title_zh, title_en, content_zh, content_en, status, req.params.id]
  );
  ok(res);
}));

router.delete('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  await pool.execute(`UPDATE announcements SET status='hidden' WHERE id=?`, [req.params.id]);
  ok(res);
}));

export default router;
