import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';

const router = Router();

router.get('/', auth(false), asyncHandler(async (req, res) => {
  const { status, station_id, keyword } = req.query;
  const where = [];
  const args = [];
  if (status) { where.push('b.status=?'); args.push(status); }
  if (station_id) { where.push('b.station_id=?'); args.push(station_id); }
  if (keyword) { where.push('(b.bike_no LIKE ? OR b.name LIKE ?)'); args.push(`%${keyword}%`, `%${keyword}%`); }
  const [rows] = await pool.execute(
    `SELECT b.*, s.name_zh station_name_zh, s.name_en station_name_en
     FROM bikes b LEFT JOIN stations s ON s.id=b.station_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.id DESC`,
    args
  );
  ok(res, rows);
}));

router.get('/:id', auth(false), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM bikes WHERE id=?', [req.params.id]);
  ok(res, rows[0] || null);
}));

router.post('/', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { bike_no, name, type, status = 'available', station_id, hourly_rate = 2, image_url, description } = req.body;
  await pool.execute(
    'INSERT INTO bikes (bike_no,name,type,status,station_id,hourly_rate,image_url,description) VALUES (?,?,?,?,?,?,?,?)',
    [bike_no, name, type, status, station_id, hourly_rate, image_url, description]
  );
  ok(res);
}));

router.put('/:id', auth(), allow('admin', 'staff'), asyncHandler(async (req, res) => {
  const { bike_no, name, type, status, station_id, hourly_rate, image_url, description } = req.body;
  await pool.execute(
    'UPDATE bikes SET bike_no=?, name=?, type=?, status=?, station_id=?, hourly_rate=?, image_url=?, description=? WHERE id=?',
    [bike_no, name, type, status, station_id, hourly_rate, image_url, description, req.params.id]
  );
  ok(res);
}));

router.delete('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  await pool.execute(`UPDATE bikes SET status='disabled' WHERE id=?`, [req.params.id]);
  ok(res);
}));

export default router;
