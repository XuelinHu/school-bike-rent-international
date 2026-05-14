import { Router } from 'express';
import { pool, tx } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';

const router = Router();
router.use(auth(), allow('admin', 'staff'));

router.get('/', asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT m.*, b.bike_no, u.username staff_name
     FROM maintenance_records m
     LEFT JOIN bikes b ON b.id=m.bike_id
     LEFT JOIN users u ON u.id=m.staff_id
     ORDER BY m.id DESC`
  );
  ok(res, rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { bike_id, staff_id, content } = req.body;
  await tx(async (conn) => {
    await conn.execute(
      `INSERT INTO maintenance_records (bike_id, staff_id, content, status, start_time)
       VALUES (?, ?, ?, 'processing', NOW())`,
      [bike_id, staff_id || req.user.id, content]
    );
    await conn.execute(`UPDATE bikes SET status='maintenance' WHERE id=?`, [bike_id]);
  });
  ok(res);
}));

router.put('/:id/finish', asyncHandler(async (req, res) => {
  await tx(async (conn) => {
    const [records] = await conn.execute('SELECT * FROM maintenance_records WHERE id=? FOR UPDATE', [req.params.id]);
    const record = records[0];
    await conn.execute(`UPDATE maintenance_records SET status='finished', end_time=NOW() WHERE id=?`, [req.params.id]);
    if (record) await conn.execute(`UPDATE bikes SET status='available' WHERE id=?`, [record.bike_id]);
  });
  ok(res);
}));

export default router;
