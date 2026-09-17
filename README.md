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

后端默认读取 `backend/.env`：

```env
DB_HOST=mysql_1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=Java@c1024
DB_NAME=student_bike_rental
```

## 初始化数据库

```bash
mysql -h mysql_1 -P 3306 -u root -p < backend/sql/schema.sql
mysql -h mysql_1 -P 3306 -u root -p student_bike_rental < backend/sql/seed.sql
```

初始化测试账号需要用 bcrypt 写入，请在安装后端依赖后运行：

```bash
cd backend
npm install
npm run seed
```

测试账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | admin | admin123456 |
| 学生 | student | student123456 |
| 运维 | staff | staff123456 |

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
