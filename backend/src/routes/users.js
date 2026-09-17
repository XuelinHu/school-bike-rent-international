import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { parsePaging, paginateRows, escapeLike, whereBuilder } from '../utils/paginate.js';

const router = Router();
router.use(auth(), allow('admin'));

const ROLES = ['student', 'admin', 'staff'];
const STATUSES = ['active', 'disabled'];

// 明确列出可返回的列，不用 SELECT *：password 哈希绝不能出现在任何响应里
const LIST_COLUMNS = 'u.id, u.username, u.name, u.email, u.phone, u.role, u.student_no, u.nationality, u.language, u.status, u.created_at';

function assertRole(role) {
  if (role !== undefined && !ROLES.includes(role)) throw new HttpError(400, `Invalid role: ${role}`);
}
function assertStatus(status) {
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, `Invalid status: ${status}`);
}

router.get('/', asyncHandler(async (req, res) => {
  const { keyword, role, status } = req.query;
  const w = whereBuilder();
  w.addIf(keyword, '(u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.student_no LIKE ?)',
    ...Array(4).fill(`%${escapeLike(keyword)}%`));
  w.addIf(role, 'u.role = ?', role);
  w.addIf(status, 'u.status = ?', status);
  const { where, params } = w.build();
  const { page, pageSize } = parsePaging(req.query);

  const result = await paginateRows(pool, {
    select: LIST_COLUMNS,
    from: 'users u',
    where,
    params,
    orderBy: 'u.id DESC',
    page,
    pageSize
  });
  ok(res, result);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT ${LIST_COLUMNS} FROM users u WHERE u.id=?`,
    [req.params.id]
  );
  ok(res, rows[0] || null);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { username, password, name, email, phone, role = 'student', student_no, nationality, language = 'zh-CN', status = 'active' } = req.body;
  if (!username || !password) throw new HttpError(400, 'Username and password are required');
  if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  assertRole(role);
  assertStatus(status);

  const [exists] = await pool.execute('SELECT id FROM users WHERE username=?', [username]);
  if (exists.length) throw new HttpError(409, 'Username already exists');

  await pool.execute(
    `INSERT INTO users (username, password, name, email, phone, role, student_no, nationality, language, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [username, await bcrypt.hash(password, 10), name || username, email || null, phone || null,
      role, student_no || null, nationality || null, language, status]
  );
  ok(res, null, 'created');
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, email, phone, role, student_no, nationality, language, status, password } = req.body;
  assertRole(role);
  assertStatus(status);

  const [rows] = await pool.execute('SELECT * FROM users WHERE id=?', [req.params.id]);
  const current = rows[0];
  if (!current) throw new HttpError(404, 'User not found');

  // 部分更新：未传的字段保留原值，避免前端只改一个字段就把其余列清空
  const next = {
    name: name ?? current.name,
    email: email ?? current.email,
    phone: phone ?? current.phone,
    role: role ?? current.role,
    student_no: student_no ?? current.student_no,
    nationality: nationality ?? current.nationality,
    language: language ?? current.language,
    status: status ?? current.status
  };

  if (password) {
    if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    next.password = await bcrypt.hash(password, 10);
  }

  const fields = Object.keys(next);
  await pool.execute(
    `UPDATE users SET ${fields.map((f) => `${f}=?`).join(', ')} WHERE id=?`,
    [...fields.map((f) => next[f]), req.params.id]
  );
  ok(res, null, 'updated');
}));

// 停用而非物理删除：rental_orders 有外键指向 users，删掉会破坏历史订单
router.delete('/:id', asyncHandler(async (req, res) => {
  if (Number(req.params.id) === Number(req.user.id)) {
    throw new HttpError(400, 'You cannot disable your own account');
  }
  await pool.execute(`UPDATE users SET status='disabled' WHERE id=?`, [req.params.id]);
  ok(res, null, 'disabled');
}));

export default router;
