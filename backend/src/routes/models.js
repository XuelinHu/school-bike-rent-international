import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { parsePaging, escapeLike } from '../utils/paginate.js';

const router = Router();
const MODEL_KEY = /^[a-z0-9][a-z0-9-]{2,59}$/;
const COLORS = /^#[0-9A-Fa-f]{6}$/;

router.get('/', auth(false), asyncHandler(async (req, res) => {
  if (req.query.manage === '1' || req.user?.role === 'admin') {
    if (req.user?.role !== 'admin') throw new HttpError(403, 'Forbidden');
    const { page, pageSize } = parsePaging(req.query);
    const clauses = [];
    const params = [];
    if (req.query.status) {
      params.push(req.query.status);
      clauses.push(`status=$${params.length}`);
    }
    if (req.query.keyword) {
      params.push(`%${escapeLike(req.query.keyword)}%`);
      clauses.push(`(model_key ILIKE $${params.length} OR name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM bike_models${where}`, params);
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await pool.query(
      `SELECT id, model_key, name, description, preview_type, color, status, sort_order, created_at, updated_at FROM bike_models${where} ORDER BY sort_order, id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return ok(res, { list: rows.rows, total: count.rows[0].total, page, pageSize });
  }
  const { rows } = await pool.query(
    "SELECT id, model_key, name, description, preview_type, color FROM bike_models WHERE status='published' ORDER BY sort_order, id"
  );
  ok(res, rows);
}));

router.post('/', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { model_key, name, description = '', preview_type = 'bike-city', color = '#128c75', status = 'draft', sort_order = 0 } = req.body;
  if (!MODEL_KEY.test(String(model_key || '')) || !String(name || '').trim()) throw new HttpError(400, 'A valid model_key and name are required');
  if (!COLORS.test(color) || !['bike-city', 'bike-classic', 'bike-sport'].includes(preview_type)) throw new HttpError(400, 'Invalid model preview parameters');
  if (!['published', 'draft'].includes(status)) throw new HttpError(400, 'Invalid model status');
  const { rows } = await pool.query(
    'INSERT INTO bike_models (model_key, name, description, preview_type, color, status, sort_order, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [model_key, name.trim(), description, preview_type, color, status, Number(sort_order) || 0, req.user.id]
  );
  ok(res, { id: rows[0].id }, 'created');
}));

router.put('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const [currentRows] = await pool.execute('SELECT * FROM bike_models WHERE id=?', [req.params.id]);
  const current = currentRows[0];
  if (!current) throw new HttpError(404, 'Model not found');
  const next = { ...current, ...req.body };
  if (!MODEL_KEY.test(String(next.model_key)) || !String(next.name || '').trim() || !COLORS.test(next.color)
      || !['bike-city', 'bike-classic', 'bike-sport'].includes(next.preview_type)
      || !['published', 'draft'].includes(next.status)) throw new HttpError(400, 'Invalid model fields');
  await pool.execute(
    'UPDATE bike_models SET model_key=?, name=?, description=?, preview_type=?, color=?, status=?, sort_order=? WHERE id=?',
    [next.model_key, next.name.trim(), next.description || '', next.preview_type, next.color, next.status, Number(next.sort_order) || 0, req.params.id]
  );
  ok(res, null, 'updated');
}));

router.delete('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  await pool.execute("UPDATE bike_models SET status='draft' WHERE id=?", [req.params.id]);
  ok(res, null, 'unpublished');
}));

export default router;
