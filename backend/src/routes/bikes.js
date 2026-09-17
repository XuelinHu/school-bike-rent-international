import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { parsePaging, paginateRows, escapeLike, whereBuilder } from '../utils/paginate.js';

const router = Router();

const STATUSES = ['available', 'rented', 'maintenance', 'disabled'];
const LIST_COLUMNS = 'b.*, s.name_zh AS station_name_zh, s.name_en AS station_name_en';

/**
 * 列表接口。前端学生端与管理台共用，统一返回 { list, total, page, pageSize }。
 * 注意：`status` 过滤对所有人开放是安全的——车辆状态本来就在单车列表上公开展示。
 */
router.get('/', auth(false), asyncHandler(async (req, res) => {
  const { status, station_id, keyword, type } = req.query;
  const w = whereBuilder();
  w.addIf(status, 'b.status = ?', status);
  w.addIf(station_id, 'b.station_id = ?', station_id);
  w.addIf(type, 'b.type = ?', type);
  w.addIf(keyword, '(b.bike_no LIKE ? OR b.name LIKE ?)', `%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`);
  const { where, params } = w.build();
  const { page, pageSize } = parsePaging(req.query);

  const result = await paginateRows(pool, {
    select: LIST_COLUMNS,
    from: 'bikes b LEFT JOIN stations s ON s.id = b.station_id',
    where,
    params,
    orderBy: 'b.id DESC',
    page,
    pageSize
  });
  ok(res, result);
}));

router.get('/:id', auth(false), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM bikes WHERE id=?', [req.params.id]);
  ok(res, rows[0] || null);
}));

router.post('/', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { bike_no, name, type, status = 'available', station_id, hourly_rate = 2, image_url, description } = req.body;
  if (!bike_no) throw new HttpError(400, 'bike_no is required');
  if (!STATUSES.includes(status)) throw new HttpError(400, `Invalid status: ${status}`);

  const [exists] = await pool.execute('SELECT id FROM bikes WHERE bike_no=?', [bike_no]);
  if (exists.length) throw new HttpError(409, 'Bike number already exists');

  await pool.execute(
    'INSERT INTO bikes (bike_no,name,type,status,station_id,hourly_rate,image_url,description) VALUES (?,?,?,?,?,?,?,?)',
    [bike_no, name || bike_no, type || 'standard', status, station_id || null, hourly_rate, image_url || null, description || null]
  );
  ok(res, null, 'created');
}));

router.put('/:id', auth(), allow('admin', 'staff'), asyncHandler(async (req, res) => {
  const { bike_no, name, type, status, station_id, hourly_rate, image_url, description } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, `Invalid status: ${status}`);

  const [rows] = await pool.execute('SELECT * FROM bikes WHERE id=?', [req.params.id]);
  const current = rows[0];
  if (!current) throw new HttpError(404, 'Bike not found');

  await pool.execute(
    'UPDATE bikes SET bike_no=?, name=?, type=?, status=?, station_id=?, hourly_rate=?, image_url=?, description=? WHERE id=?',
    [
      bike_no ?? current.bike_no,
      name ?? current.name,
      type ?? current.type,
      status ?? current.status,
      station_id ?? current.station_id,
      hourly_rate ?? current.hourly_rate,
      image_url ?? current.image_url,
      description ?? current.description,
      req.params.id
    ]
  );
  ok(res, null, 'updated');
}));

router.delete('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  // 软删除：rental_orders / maintenance_records 都有外键指向 bikes
  await pool.execute(`UPDATE bikes SET status='disabled' WHERE id=?`, [req.params.id]);
  ok(res, null, 'disabled');
}));

export default router;
