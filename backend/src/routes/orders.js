import { Router } from 'express';
import { nanoid } from 'nanoid';
import { pool, tx } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
router.use(auth());

router.get('/', allow('admin'), asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT o.*, u.username, b.bike_no FROM rental_orders o
     LEFT JOIN users u ON u.id=o.user_id LEFT JOIN bikes b ON b.id=o.bike_id
     ORDER BY o.id DESC`
  );
  ok(res, rows);
}));

router.get('/my', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM rental_orders WHERE user_id=? ORDER BY id DESC', [req.user.id]);
  ok(res, rows);
}));

router.get('/current', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`SELECT * FROM rental_orders WHERE user_id=? AND status='renting' ORDER BY id DESC LIMIT 1`, [req.user.id]);
  ok(res, rows[0] || null);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM rental_orders WHERE id=?', [req.params.id]);
  const order = rows[0];
  if (!order) return ok(res, null);
  if (req.user.role !== 'admin' && order.user_id !== req.user.id) throw new HttpError(403, 'Forbidden');
  ok(res, order);
}));

router.post('/rent', allow('student', 'admin'), asyncHandler(async (req, res) => {
  const { bike_id, start_station_id } = req.body;
  const order = await tx(async (conn) => {
    const [active] = await conn.execute(`SELECT id FROM rental_orders WHERE user_id=? AND status='renting'`, [req.user.id]);
    if (active.length) throw new HttpError(400, 'You already have an active rental');
    const [bikes] = await conn.execute(`SELECT * FROM bikes WHERE id=? FOR UPDATE`, [bike_id]);
    const bike = bikes[0];
    if (!bike || bike.status !== 'available') throw new HttpError(400, 'Bike is not available');
    await conn.execute(`UPDATE bikes SET status='rented' WHERE id=?`, [bike_id]);
    const orderNo = `RO${Date.now()}${nanoid(6).toUpperCase()}`;
    await conn.execute(
      `INSERT INTO rental_orders (order_no,user_id,bike_id,start_time,hourly_rate,status,start_station_id)
       VALUES (?, ?, ?, NOW(), ?, 'renting', ?)`,
      [orderNo, req.user.id, bike_id, bike.hourly_rate, start_station_id || bike.station_id]
    );
    const [rows] = await conn.execute('SELECT * FROM rental_orders WHERE order_no=?', [orderNo]);
    return rows[0];
  });
  ok(res, order, 'rented');
}));

router.put('/:id/return', allow('student', 'admin'), asyncHandler(async (req, res) => {
  const { end_station_id } = req.body;
  const result = await tx(async (conn) => {
    const [orders] = await conn.execute(`SELECT * FROM rental_orders WHERE id=? FOR UPDATE`, [req.params.id]);
    const order = orders[0];
    if (!order || order.status !== 'renting') throw new HttpError(400, 'Order is not active');
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) throw new HttpError(403, 'Forbidden');
    const minutesUsed = Math.ceil((Date.now() - new Date(order.start_time).getTime()) / 60000);
    const hours = Math.max(1, Math.ceil(minutesUsed / 60));
    const total = Number((hours * Number(order.hourly_rate)).toFixed(2));
    await conn.execute(
      `UPDATE rental_orders SET end_time=NOW(), duration_hours=?, total_amount=?, status='completed', end_station_id=? WHERE id=?`,
      [hours, total, end_station_id || order.start_station_id, order.id]
    );
    await conn.execute(`UPDATE bikes SET status='available', station_id=? WHERE id=?`, [end_station_id || order.start_station_id, order.bike_id]);
    const [rows] = await conn.execute('SELECT * FROM rental_orders WHERE id=?', [order.id]);
    return rows[0];
  });
  ok(res, result, 'returned');
}));

export default router;
