import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';

const router = Router();

router.get('/', auth(false), asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute('SELECT * FROM stations ORDER BY id DESC');
  ok(res, rows);
}));

router.get('/:id', auth(false), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM stations WHERE id=?', [req.params.id]);
  ok(res, rows[0] || null);
}));

router.post('/', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { name_zh, name_en, address_zh, address_en, latitude, longitude, capacity } = req.body;
  await pool.execute(
    'INSERT INTO stations (name_zh,name_en,address_zh,address_en,latitude,longitude,capacity) VALUES (?,?,?,?,?,?,?)',
    [name_zh, name_en, address_zh, address_en, latitude, longitude, capacity]
  );
  ok(res);
}));

router.put('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { name_zh, name_en, address_zh, address_en, latitude, longitude, capacity } = req.body;
  await pool.execute(
    'UPDATE stations SET name_zh=?, name_en=?, address_zh=?, address_en=?, latitude=?, longitude=?, capacity=? WHERE id=?',
    [name_zh, name_en, address_zh, address_en, latitude, longitude, capacity, req.params.id]
  );
  ok(res);
}));

router.delete('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  await pool.execute('DELETE FROM stations WHERE id=?', [req.params.id]);
  ok(res);
}));

export default router;
