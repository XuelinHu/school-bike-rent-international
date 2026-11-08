import { Router } from 'express';
import { nanoid } from 'nanoid';
import { pool, tx } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
router.use(auth());
const PROVIDERS = ['alipay', 'wechat'];

router.get('/providers', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT provider, mode, enabled, merchant_id_masked, app_id_masked FROM payment_provider_configs ORDER BY provider');
  ok(res, rows.map((row) => ({ ...row, mode: 'mock', credentialConfigured: false })));
}));

router.put('/providers/:provider', allow('admin'), asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { enabled, merchant_id_masked = '未配置', app_id_masked = '未配置' } = req.body || {};
  if (!PROVIDERS.includes(provider) || typeof enabled !== 'boolean') throw new HttpError(400, 'Invalid payment provider configuration');
  for (const value of [merchant_id_masked, app_id_masked]) {
    if (typeof value !== 'string' || value.length > 80 || /secret|private.?key|api.?key/i.test(value)) {
      throw new HttpError(400, 'Only masked identifiers may be stored; credentials belong in environment variables');
    }
  }
  await pool.execute(
    'UPDATE payment_provider_configs SET enabled=?, merchant_id_masked=?, app_id_masked=? WHERE provider=?',
    [enabled, merchant_id_masked, app_id_masked, provider]
  );
  ok(res, { provider, mode: 'mock', enabled, credentialConfigured: false });
}));

router.post('/orders/:orderId/pay', allow('user', 'student', 'teacher', 'admin'), asyncHandler(async (req, res) => {
  const provider = req.body?.provider;
  if (!PROVIDERS.includes(provider)) throw new HttpError(400, 'Select alipay or wechat');
  const result = await tx(async (connection) => {
    const [orderRows] = await connection.execute('SELECT * FROM rental_orders WHERE id=? FOR UPDATE', [req.params.orderId]);
    const order = orderRows[0];
    if (!order || (req.user.role !== 'admin' && order.user_id !== req.user.id)) throw new HttpError(404, 'Order not found');
    if (order.status !== 'completed') throw new HttpError(409, 'Only completed rental orders can be paid');
    const [existing] = await connection.execute('SELECT id, payment_no, provider, mode, amount, currency, status, created_at FROM payment_transactions WHERE order_id=?', [order.id]);
    if (existing[0]) return existing[0];
    const [providerRows] = await connection.execute('SELECT enabled FROM payment_provider_configs WHERE provider=?', [provider]);
    if (!providerRows[0]?.enabled) throw new HttpError(409, 'This mock payment method is disabled');
    const paymentNo = `MP${Date.now()}${nanoid(6).toUpperCase()}`;
    const [rows] = await connection.execute(
      `INSERT INTO payment_transactions (payment_no, order_id, user_id, provider, mode, amount, currency, status, provider_reference, metadata)
       VALUES (?, ?, ?, ?, 'mock', ?, 'CNY', 'succeeded', ?, ?::jsonb)
       RETURNING id, payment_no, order_id, provider, mode, amount, currency, status, created_at`,
      [paymentNo, order.id, order.user_id, provider, order.total_amount || 0, `MOCK-${nanoid(12).toUpperCase()}`, JSON.stringify({ mock: true })]
    );
    return rows[0];
  });
  ok(res, result, 'mock payment succeeded');
}));

router.get('/my', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, payment_no, order_id, provider, mode, amount, currency, status, created_at FROM payment_transactions WHERE user_id=? ORDER BY id DESC LIMIT 100',
    [req.user.id]
  );
  ok(res, rows);
}));

export default router;
