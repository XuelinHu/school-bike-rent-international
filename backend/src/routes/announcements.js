import { Router } from 'express';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { allow } from '../middleware/role.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { parsePaging, paginateRows, escapeLike, whereBuilder } from '../utils/paginate.js';

const router = Router();

const STATUSES = ['published', 'hidden'];

/**
 * 公告列表。这是公开接口（auth(false)，未登录可读）。
 *
 * ⚠️ 权限要点：加了 `status` 过滤参数之后，**绝不能让它对所有人生效**——
 * 否则任何未登录用户请求 ?status=hidden 就能拉到隐藏公告。
 * 规则：
 *   - 管理员：可以用 status 过滤；不传则可见全部（含 hidden），管理台需要管理隐藏公告
 *   - 其他人：无论传什么，一律强制 status='published'
 */
router.get('/', auth(false), asyncHandler(async (req, res) => {
  const { keyword, status } = req.query;
  const isAdmin = req.user?.role === 'admin';
  const w = whereBuilder();

  if (isAdmin) {
    w.addIf(status, 'a.status = ?', status);
  } else {
    w.add(`a.status = 'published'`);
  }

  w.addIf(keyword, '(a.title_zh LIKE ? OR a.title_en LIKE ? OR a.content_zh LIKE ? OR a.content_en LIKE ?)',
    ...Array(4).fill(`%${escapeLike(keyword)}%`));

  const { where, params } = w.build();
  const { page, pageSize } = parsePaging(req.query);

  const result = await paginateRows(pool, {
    select: 'a.id, a.title_zh, a.title_en, a.content_zh, a.content_en, a.status, a.created_by, a.created_at, a.updated_at',
    from: 'announcements a',
    where,
    params,
    orderBy: 'a.id DESC',
    page,
    pageSize
  });
  ok(res, result);
}));

router.get('/:id', auth(false), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM announcements WHERE id=?', [req.params.id]);
  const item = rows[0];
  // 隐藏公告对非管理员等同于不存在，否则详情页能绕过列表拿到内容
  if (item && item.status !== 'published' && req.user?.role !== 'admin') return ok(res, null);
  ok(res, item || null);
}));

router.post('/', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { title_zh, title_en, content_zh, content_en, status = 'published' } = req.body;
  if (!title_zh || !title_en) throw new HttpError(400, 'title_zh and title_en are required');
  if (!STATUSES.includes(status)) throw new HttpError(400, `Invalid status: ${status}`);
  await pool.execute(
    'INSERT INTO announcements (title_zh,title_en,content_zh,content_en,status,created_by) VALUES (?,?,?,?,?,?)',
    [title_zh, title_en, content_zh || '', content_en || '', status, req.user.id]
  );
  ok(res, null, 'created');
}));

router.put('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  const { title_zh, title_en, content_zh, content_en, status } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, `Invalid status: ${status}`);

  const [rows] = await pool.execute('SELECT * FROM announcements WHERE id=?', [req.params.id]);
  const current = rows[0];
  if (!current) throw new HttpError(404, 'Announcement not found');

  await pool.execute(
    'UPDATE announcements SET title_zh=?, title_en=?, content_zh=?, content_en=?, status=? WHERE id=?',
    [
      title_zh ?? current.title_zh,
      title_en ?? current.title_en,
      content_zh ?? current.content_zh,
      content_en ?? current.content_en,
      status ?? current.status,
      req.params.id
    ]
  );
  ok(res, null, 'updated');
}));

// 软删除：下架而不是物理删除，保留历史
router.delete('/:id', auth(), allow('admin'), asyncHandler(async (req, res) => {
  await pool.execute(`UPDATE announcements SET status='hidden' WHERE id=?`, [req.params.id]);
  ok(res, null, 'hidden');
}));

export default router;
