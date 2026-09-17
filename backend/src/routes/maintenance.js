import { Router } from 'express';
import { pool, tx } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { parsePaging, paginateRows, escapeLike, whereBuilder } from '../utils/paginate.js';

const router = Router();
router.use(auth(), allow('admin', 'staff'));

router.get('/', asyncHandler(async (req, res) => {
  const { status, keyword, bike_id } = req.query;
  const w = whereBuilder();
  w.addIf(status, 'm.status = ?', status);
  w.addIf(bike_id, 'm.bike_id = ?', bike_id);
  w.addIf(keyword, '(b.bike_no LIKE ? OR m.content LIKE ? OR u.username LIKE ?)',
    ...Array(3).fill(`%${escapeLike(keyword)}%`));
  const { where, params } = w.build();
  const { page, pageSize } = parsePaging(req.query);

  const result = await paginateRows(pool, {
    select: 'm.*, b.bike_no, u.username AS staff_name',
    from: `maintenance_records m
           LEFT JOIN bikes b ON b.id = m.bike_id
           LEFT JOIN users u ON u.id = m.staff_id`,
    where,
    params,
    orderBy: 'm.id DESC',
    page,
    pageSize
  });
  ok(res, result);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { bike_id, staff_id, content } = req.body;
  if (!bike_id || !content) throw new HttpError(400, 'bike_id and content are required');

  const [bikes] = await pool.execute('SELECT id, status FROM bikes WHERE id=?', [bike_id]);
  const bike = bikes[0];
  if (!bike) throw new HttpError(404, 'Bike not found');
  // 已在维护中的车不该重复开单，否则收尾时会把状态改乱
  if (bike.status === 'maintenance') throw new HttpError(409, 'Bike is already under maintenance');

  await tx(async (conn) => {
    await conn.execute(
      `INSERT INTO maintenance_records (bike_id, staff_id, content, status, start_time)
       VALUES (?, ?, ?, 'processing', NOW())`,
      [bike_id, staff_id || req.user.id, content]
    );
    await conn.execute(`UPDATE bikes SET status='maintenance' WHERE id=?`, [bike_id]);
  });
  ok(res, null, 'created');
}));

router.put('/:id/finish', asyncHandler(async (req, res) => {
  await tx(async (conn) => {
    const [records] = await conn.execute('SELECT * FROM maintenance_records WHERE id=? FOR UPDATE', [req.params.id]);
    const record = records[0];
    if (!record) throw new HttpError(404, 'Maintenance record not found');
    if (record.status === 'finished') throw new HttpError(409, 'Already finished');
    await conn.execute(`UPDATE maintenance_records SET status='finished', end_time=NOW() WHERE id=?`, [req.params.id]);
    // 保养完把车放回可租状态
    await conn.execute(`UPDATE bikes SET status='available' WHERE id=?`, [record.bike_id]);
  });
  ok(res, null, 'finished');
}));

// 删除维护记录。只允许删"已完成"的，进行中的记录关联着车辆状态，删掉会让车永远卡在维护中
router.delete('/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM maintenance_records WHERE id=?', [req.params.id]);
  const record = rows[0];
  if (!record) throw new HttpError(404, 'Maintenance record not found');
  if (record.status !== 'finished') throw new HttpError(409, 'Finish the maintenance before deleting the record');
  await pool.execute('DELETE FROM maintenance_records WHERE id=?', [req.params.id]);
  ok(res, null, 'deleted');
}));

export default router;
