import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { auth } from '../middleware/auth.js';
import { asyncHandler, ok } from '../utils/response.js';
import { HttpError } from '../utils/errors.js';
import { createLimiter, clientIp } from '../utils/rateLimit.js';

const router = Router();
const publicUserFields = 'id, username, name, email, phone, role, student_no, nationality, language, status, created_at';

const MIN_PASSWORD_LENGTH = 6;

/**
 * 重置令牌用**独立密钥**签发（在 JWT_SECRET 基础上派生）。
 * 这样重置令牌在数学上不可能被 auth() 中间件接受为登录令牌，
 * 反过来登录令牌也换不了密码——比只靠一个 purpose 声明字段可靠。
 */
function resetSecret() {
  return `${process.env.JWT_SECRET || 'dev_secret'}:password-reset`;
}

// 忘记密码是天然的"用户枚举预言机"（学号本身也是半公开信息），
// 因此按 IP 和按用户名各限一道，抬高撞库成本
const verifyLimiterByIp = createLimiter({ windowMs: 10 * 60 * 1000, max: 5 });
const verifyLimiterByUser = createLimiter({ windowMs: 10 * 60 * 1000, max: 3 });

/** 身份核验失败的统一文案：绝不区分"用户名不存在"还是"学号不对"，避免被逐项试出来 */
const IDENTITY_MISMATCH = 'Identity information does not match our records';

router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, name, email, phone, student_no, nationality, language = 'zh-CN' } = req.body;
  if (!username || !password) throw new HttpError(400, 'Username and password are required');
  if (String(username).length < 3) throw new HttpError(400, 'Username must be at least 3 characters');
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  // 先查一次，给出可读错误；数据库的唯一键约束仍作最后防线（并发注册时兜底）
  const [exists] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
  if (exists.length) throw new HttpError(409, 'Username already exists');

  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.execute(
      `INSERT INTO users (username, password, name, email, phone, role, student_no, nationality, language, status)
       VALUES (?, ?, ?, ?, ?, 'student', ?, ?, ?, 'active')`,
      [username, hash, name || username, email || null, phone || null, student_no || null, nationality || null, language]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Username already exists');
    throw err;
  }
  ok(res, null, 'registered');
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await pool.execute(`SELECT * FROM users WHERE username = ? AND status = 'active'`, [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password))) {
    throw new HttpError(401, 'Invalid username or password');
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
  delete user.password;
  ok(res, { token, user });
}));

router.get('/profile', auth(), asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`SELECT ${publicUserFields} FROM users WHERE id = ?`, [req.user.id]);
  ok(res, rows[0]);
}));

router.put('/profile', auth(), asyncHandler(async (req, res) => {
  const { name, email, phone, nationality, language } = req.body;
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const current = rows[0];
  if (!current) throw new HttpError(404, 'User not found');

  await pool.execute(
    'UPDATE users SET name=?, email=?, phone=?, nationality=?, language=? WHERE id=?',
    [
      name ?? current.name,
      email ?? current.email,
      phone ?? current.phone,
      nationality ?? current.nationality,
      language ?? current.language,
      req.user.id
    ]
  );
  ok(res, null, 'updated');
}));

/** 登录后修改密码：必须校验旧密码 */
router.put('/password', auth(), asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (oldPassword === newPassword) throw new HttpError(400, 'New password must differ from the old one');

  const [rows] = await pool.execute('SELECT password FROM users WHERE id=?', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(oldPassword || '', rows[0].password))) {
    throw new HttpError(400, 'Old password is incorrect');
  }
  await pool.execute('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(newPassword, 10), req.user.id]);
  ok(res, null, 'password updated');
}));

/**
 * 忘记密码第一步：核验身份。
 * 用「用户名 + 学号 + 邮箱」三项与同一条记录全匹配来替代邮件验证码
 * （本项目未配置任何 SMTP 服务）。
 *
 * 注意：email / student_no 在库中可为 NULL，而 `email = ?` 永远不匹配 NULL，
 * 所以三个字段都必须非空校验收敛在下面。
 */
router.post('/forgot-password/verify', asyncHandler(async (req, res) => {
  const { username, student_no, email } = req.body;

  const ipCheck = verifyLimiterByIp(clientIp(req));
  if (!ipCheck.allowed) {
    throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(ipCheck.retryAfterMs / 60000)} minute(s)`);
  }
  const userCheck = verifyLimiterByUser(String(username || '').trim().toLowerCase());
  if (!userCheck.allowed) {
    throw new HttpError(429, `Too many attempts for this account. Try again in ${Math.ceil(userCheck.retryAfterMs / 60000)} minute(s)`);
  }

  if (!username || !student_no || !email) throw new HttpError(400, IDENTITY_MISMATCH);

  const [rows] = await pool.execute(
    `SELECT id, username FROM users
     WHERE username = ? AND student_no = ? AND email = ? AND status = 'active'`,
    [String(username).trim(), String(student_no).trim(), String(email).trim()]
  );
  const user = rows[0];
  if (!user) throw new HttpError(400, IDENTITY_MISMATCH);

  const resetToken = jwt.sign(
    { id: user.id, username: user.username, purpose: 'password-reset' },
    resetSecret(),
    { expiresIn: '10m' }
  );
  ok(res, { resetToken });
}));

/** 忘记密码第二步：用上一步拿到的短期令牌设置新密码 */
router.post('/forgot-password/reset', asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken) throw new HttpError(400, 'Reset token is required');
  if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, resetSecret());
  } catch {
    throw new HttpError(400, 'Reset link has expired or is invalid. Please verify your identity again.');
  }
  if (payload.purpose !== 'password-reset') throw new HttpError(400, 'Invalid reset token');

  const [rows] = await pool.execute(`SELECT id FROM users WHERE id=? AND status='active'`, [payload.id]);
  if (!rows.length) throw new HttpError(400, 'Account is not available');

  await pool.execute('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(newPassword, 10), payload.id]);
  ok(res, null, 'password reset');
}));

export default router;
