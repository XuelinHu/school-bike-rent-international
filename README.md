# school-bike-rent-international

<p align="center">
  <img height="20" alt="Vue 3.5.13" src="https://img.shields.io/badge/vue-3.5.13-4FC08D" />
  <img height="20" alt="Vite 6.0.3" src="https://img.shields.io/badge/vite-6.0.3-646CFF" />
  <img height="20" alt="Vue Router 4.5.0" src="https://img.shields.io/badge/vue_router-4.5.0-4FC08D" />
  <img height="20" alt="Express 4.21.2" src="https://img.shields.io/badge/express-4.21.2-000000" />
  <img height="20" alt="MySQL configured" src="https://img.shields.io/badge/mysql-configured-4479A1" />
  <img height="20" alt="License GPL-2.0" src="https://img.shields.io/badge/license-GPL--2.0-3DA639" />
</p>

国际化学生单车租赁软件

这是一个 Node.js + Express + MySQL 后端、Vue3 + Vite H5 前端的校园学生单车租赁系统。系统支持学生租车还车、订单查询、公告浏览、中英文切换，以及管理员后台管理用户、单车、订单、站点、维护和公告。

## 目录结构

```text
backend/   Node.js REST API
frontend/  Vue3 H5 前端
tmp/       本次生成需求临时稿
```

## 数据库配置

后端连接配置从 `backend/.env` 读取，字段模板见 `backend/.env.example`。不要把真实账号、密码或连接串写入文档或提交到 Git；曾公开的数据库凭据应在数据库端轮换。

## 初始化数据库

```bash
cd backend
npm install
npm run db:init
```

`db:init` 创建表结构并写入基础站点和公告，不会创建管理员账号。演示用户和业务数据只允许写入名称以 `_dev`、`_test` 或 `_demo` 结尾的隔离数据库，并且必须显式启用。请只在本机 `backend/.env` 配置以下项目，不要提交该文件：

```dotenv
DB_NAME=student_bike_rental_test
ALLOW_DEMO_SEED=1
SEED_ADMIN_PASSWORD=<独立且至少16位>
SEED_STUDENT_PASSWORD=<独立且至少16位>
SEED_STAFF_PASSWORD=<独立且至少16位>
SMOKE_USERNAME=student
SMOKE_PASSWORD=<与SEED_STUDENT_PASSWORD相同>
SMOKE_ADMIN_USERNAME=admin
SMOKE_ADMIN_PASSWORD=<与SEED_ADMIN_PASSWORD相同>
BASE_URL=
```

配置完后运行 `npm run seed:demo`。它会更新该隔离库中的演示账号密码，因此不要指向生产库或含有真实用户数据的数据库。`npm run seed` 也受相同的隔离库、显式开关和强密码校验保护。生产初始管理员需由独立的受控运维流程创建；本仓库的演示播种命令不支持生产数据库。

冒烟测试还要求配置 `SMOKE_PASSWORD` 和 `SMOKE_ADMIN_PASSWORD`，不会回退到仓库内置口令。并发租车测试复用 `SMOKE_PASSWORD`。所有账号密码只从被忽略的本地 `.env` 读取。

如需从空库执行完整自动化业务测试，可把 `DB_NAME` 设为专用 `_test` 库、配置上述本地密码并设置 `ALLOW_DEMO_SEED=1`，然后在 `backend/` 运行 `npm run test:integration`。该命令初始化隔离库、播种演示数据、启动随机本地端口的临时 API，并执行七类分页、学生/管理员登录、租车/还车、并发租赁及租赁历史站点保护测试；测试数据保留在该 `_test` 库中，不会自动删除数据库。

## 启动后端

```bash
cd backend
npm run dev
```

默认地址：`http://localhost:8032`。

## 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://localhost:4030`。

前端默认通过同源 `/api` 访问后端；Vite 开发和预览服务会将请求代理到本机 `8032` 端口。安卓 WebView 或局域网浏览器使用 `http://<服务器局域网地址>:4030`，无需把 API 地址写成手机的 `localhost`。独立部署 API 时，可在构建环境中用 `VITE_API_BASE` 覆盖为 HTTPS API 地址。

数据库初始化使用配置的 `DB_NAME`，并将 migration 版本与 SHA-256 checksum 记录到 `schema_migrations`。`backend/sql/schema.sql` 是不可修改的 `001_initial_schema` 基线；后续结构调整请新增 `backend/sql/migrations/NNN_description.sql` 或 `NNN_description.js`，不要改写已应用的 migration。初始化采用 MySQL advisory lock 串行执行，并在成功后写入版本记录；基础站点和公告 seed 可重复运行。`003_station_history_foreign_keys` 为租赁起止站点建立 `ON DELETE RESTRICT` 外键，检测到孤儿订单引用时会拒绝迁移；删除被车辆或历史订单引用的站点会返回 409。

### 数据库加密备份与测试库恢复

备份使用 InnoDB 一致性快照、gzip 和 AES-256-GCM；密钥通过 `DB_BACKUP_ENCRYPTION_KEY` 提供，必须是 64 位十六进制字符串，并应单独保存在密码管理器中。不要将备份文件或密钥提交到仓库。生成密钥可在本地运行 `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`，然后把结果安全地设置到当前运行环境。

```bash
cd backend
npm run db:backup
```

默认输出到 `backend/backups/`，已有目标文件不会被覆盖。演练恢复时，先在 `backend/.env` 中把 `DB_NAME` 改为专用的 `_test` 数据库名，并使用与备份相同的密钥；初始化该测试库后，再显式确认替换其中的数据：

```bash
npm run db:init
npm run db:restore -- --source "./backups/student_bike_rental-<timestamp>.sbrbak" --replace
```

恢复工具只允许 `DB_NAME` 以 `_test` 结尾；目标必须预先初始化为与快照相同的表结构。它会先验证加密认证标签、结构指纹和每表行数，再在事务中替换行数据，并恢复自增序列位置；不执行快照中的 SQL，也不删除数据库。恢复演练后仍应核对业务记录，并定期把加密备份复制到独立存储。

后端功能冒烟测试只允许使用名称以 `_test` 结尾的数据库：先在测试配置中运行 `npm run db:init` 和 `npm run seed:demo`，启动 API 后运行 `npm run smoke`。测试覆盖七类列表分页及跨页分离，并实际创建、归还一笔租车订单。
租车并发约束也可在同一隔离环境验证：运行 `npm run test:concurrency`，脚本会并发请求两辆可用车辆，检查每个用户只能有一笔活动订单，并归还成功创建的测试订单。
数据库通过虚拟生成列和唯一索引强制每位用户最多一笔活动租车；服务事务先锁用户再锁车辆，避免同一用户并发选择不同车辆时绕过活动订单检查。迁移会在创建唯一索引前检查重复活动订单，发现冲突会停止并报告用户 ID，不会自动改写存量订单。

多用户订单负载验证使用独立的 `_load_test` 数据库，会启动临时 API 实例，并创建、归还后清理 40 个合成用户和车辆。请求数可设置为 10–100；只有显式确认变量存在时才会运行：

```powershell
$env:DB_NAME = "bike_rental_20261012_load_test"
$env:LOAD_TEST_CONFIRM = "1"
$env:LOAD_TEST_REQUESTS = "40"
npm run db:init
npm run test:load
```

负载脚本测量登录、并发租车、并发还车各阶段的吞吐及 p50/p95 延迟，并检查订单与车辆状态。它拒绝其他数据库名；请勿将业务库或已有测试数据目录指定为该负载目标。

## 主要接口

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `PUT /api/auth/password` — 登录后改密码
- `POST /api/auth/forgot-password/verify` — 用户名 + 学号 + 邮箱 三项匹配，返回一次性 resetToken
- `POST /api/auth/forgot-password/reset` — 用 resetToken 设置新密码
- `GET /api/bikes`
- `POST /api/orders/rent`
- `PUT /api/orders/:id/return`
- `GET /api/dashboard/stats`

**列表接口一律返回分页信封**（`/api/users`、`/api/bikes`、`/api/orders`、`/api/stations`、
`/api/maintenance`、`/api/announcements`）：

```json
{ "code": 200, "message": "success",
  "data": { "list": [], "total": 42, "page": 1, "pageSize": 10 } }
```

公共查询参数：`page`、`pageSize`（上限 100，超出自动夹取；非法值回落默认）、
`keyword`，以及各接口自己的筛选字段。排序字段走白名单，不接受任意列名。

其余接口统一返回：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 智能助手接口

- `GET /api/ai/models` — 模型目录（本机 Ollama 实时模型 + 环境变量里配置的云模型），未登录可读
- `POST /api/ai/chat` — 流式对话，**需登录**并限流；返回 `application/x-ndjson`
- `GET /api/ai/status` — 显存与已加载模型（仅 admin）
- `POST /api/ai/models/:name/load` `/unload` — 加载/卸载（仅 admin）

流式事件类型：`start` / `ping` / `text` / `tool_call` / `tool_result` / `reset` / `error` / `done`。
用 POST + NDJSON 而不是 SSE，是因为 `EventSource` 只能发 GET，**没法带 `Authorization` 头**。

## 已实现页面

- 登录页、注册页、首页
- 忘记密码、修改密码
- 单车列表、单车详情、租赁确认
- 当前订单、历史订单、个人中心
- 公告列表、公告详情
- 管理后台、用户管理、单车管理、订单管理、站点管理、维护管理、公告管理
- AI 模型管理（`/admin/ai-models`，仅 admin）

管理台的 6 个菜单共用一套声明式配置（`frontend/src/config/adminSchemas.js`）+
一套渲染组件，全部支持分页、关键字搜索、筛选和增删改弹窗。

## 业务智能体

登录后右下角出现悬浮球，点开是与单车租赁业务绑定的助手（人设 + 业务知识库 + 查库工具），
回答以 NDJSON 流式返回，支持中止、语音播报和语音对话。模型可在面板顶部下拉切换，
选项来自**本机 Ollama 已安装的模型**（`GET /api/tags` 实时读取）与环境变量里配置的云模型。

- 模型定制：系统提示词 + 业务知识库 + function calling 查库工具，**不需要训练、不接向量库**。
- 权限：所有登录用户可见，但**工具按角色裁剪下发**，并在执行层再校验一次角色
  （学生的请求里根本不存在 `admin_*` 工具定义，诱导也调不出来）。
- 语音：安卓端走原生桥（契约见 `docs/ai/android-voice-bridge.md`），
  浏览器端走 Web Speech API。⚠️ **公网入口是明文 HTTP，浏览器判定为非安全上下文，
  语音输入在那里不可用**（TTS 播报不受影响）；要语音输入请用安卓 App 或 HTTPS。

## 说明

- 租车和还车接口使用数据库事务。
- 密码使用 bcryptjs 加密。
- 登录使用 JWT。
- 忘记密码用 用户名 + 学号 + 邮箱 三项匹配后直接重置（不依赖邮件服务），
  签发的一次性令牌用**独立派生密钥**签名，登录 token 无法拿来重置密码。
  该接口天然可被用来枚举用户，因此加了内存令牌桶限流；**单进程有效，重启即清零**。
- 前端语言选择保存在 `localStorage.lang`。
- 前端不引入 UI 库、状态库、请求库；所有样式集中在 `frontend/src/assets/style.css`。

## 开源协议

本项目使用 GNU General Public License v2.0（GPL-2.0）开源，详见 `LICENSE`。

## 启动端口

网页入口：4030；后台服务：8032。完整启动约定见 [PORTS.md](./PORTS.md)。
