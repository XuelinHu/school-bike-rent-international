import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { parsePaging, paginateRows, escapeLike, whereBuilder } from '../utils/paginate.js';

const router = Router();

/**
 * 经纬度是可空列，前端留空时可能传 '' 也可能整个字段不传（undefined）。
 * 两种都要收敛成 NULL —— undefined 直接进 mysql2 的 execute() 会抛
 * "Bind parameters must not contain undefined"，表现为 500。
 */
const nullableNum = (v) => (v === '' || v === undefined ? null : v);

router.get('/', auth(false), asyncHandler(async (req, res) => {
  const { keyword } = req.query;
  const w = whereBuilder();
  w.addIf(keyword, '(s.name_zh LIKE ? OR s.name_en LIKE ? OR s.address_zh LIKE ? OR s.address_en LIKE ?)',
    ...Array(4).fill(`%${escapeLike(keyword)}%`));
  const { where, params } = w.build();
  const { page, pageSize } = parsePaging(req.query);

  // 顺带把每个站点的在架可租数量带出来，管理台列表和智能体的站点工具都用得上
  const result = await paginateRows(pool, {
    select: `s.*,
      (SELECT COUNT(*) FROM bikes b WHERE b.station_id = s.id AND b.status = 'available') AS available_count,
      (SELECT COUNT(*) FROM bikes b WHERE b.station_id = s.id) AS bike_count`,
    from: 'stations s',
    where,
    params,
    orderBy: 's.id DESC',
    page,
    pageSize
  });
  ok(res, result);
}));

router.get('/:id', auth(false), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM stations WHERE id=?', [req.params.id]);
  ok(res, rows[0] || null);
}));

router.post('/', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { name_zh, name_en, address_zh, address_en, latitude, longitude, capacity } = req.body;
  if (!name_zh || !name_en) throw new HttpError(400, 'name_zh and name_en are required');
  await pool.execute(
    'INSERT INTO stations (name_zh,name_en,address_zh,address_en,latitude,longitude,capacity) VALUES (?,?,?,?,?,?,?)',
    [name_zh, name_en, address_zh || null, address_en || null,
      nullableNum(latitude), nullableNum(longitude), capacity || 0]
  );
  ok(res, null, 'created');
}));

router.put('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { name_zh, name_en, address_zh, address_en, latitude, longitude, capacity } = req.body;
  const [rows] = await pool.execute('SELECT * FROM stations WHERE id=?', [req.params.id]);
  const current = rows[0];
  if (!current) throw new HttpError(404, 'Station not found');

  await pool.execute(
    'UPDATE stations SET name_zh=?, name_en=?, address_zh=?, address_en=?, latitude=?, longitude=?, capacity=? WHERE id=?',
    [
      name_zh ?? current.name_zh,
      name_en ?? current.name_en,
      address_zh ?? current.address_zh,
      address_en ?? current.address_en,
      // 显式传空 -> 清成 NULL；没传这个字段 -> 保留原值
      nullableNum(latitude) ?? current.latitude,
      nullableNum(longitude) ?? current.longitude,
      capacity ?? current.capacity,
      req.params.id
    ]
  );
  ok(res, null, 'updated');
}));

router.delete('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  // bikes.station_id 外键是 ON DELETE SET NULL，删站点会把车变成"无站点"，
  // 所以有车在站时直接拒绝，逼管理员先把车挪走
  const [[{ count }]] = await pool.execute('SELECT COUNT(*) AS count FROM bikes WHERE station_id=?', [req.params.id]);
  if (Number(count) > 0) throw new HttpError(409, `Station still has ${count} bike(s). Move them first.`);
  await pool.execute('DELETE FROM stations WHERE id=?', [req.params.id]);
  ok(res, null, 'deleted');
}));

export default router;
