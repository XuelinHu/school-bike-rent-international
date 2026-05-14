import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';

const router = Router();
router.use(auth(), allow('admin'));

router.get('/stats', asyncHandler(async (_req, res) => {
  const [[users]] = await pool.execute('SELECT COUNT(*) count FROM users');
  const [[bikes]] = await pool.execute('SELECT COUNT(*) count FROM bikes');
  const [[renting]] = await pool.execute(`SELECT COUNT(*) count FROM rental_orders WHERE status='renting'`);
  const [[income]] = await pool.execute(`SELECT COALESCE(SUM(total_amount),0) total FROM rental_orders WHERE status='completed'`);
  ok(res, {
    users: users.count,
    bikes: bikes.count,
    activeOrders: renting.count,
    totalIncome: Number(income.total)
  });
}));

export default router;
