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

默认地址：`http://localhost:3000`。

## 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://localhost:5173`。

## 主要接口

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `GET /api/bikes`
- `POST /api/orders/rent`
- `PUT /api/orders/:id/return`
- `GET /api/dashboard/stats`

接口统一返回：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

## 已实现页面

- 登录页、注册页、首页
- 单车列表、单车详情、租赁确认
- 当前订单、历史订单、个人中心
- 公告列表、公告详情
- 管理后台、用户管理、单车管理、订单管理、站点管理、维护管理、公告管理

## 说明

- 租车和还车接口使用数据库事务。
- 密码使用 bcryptjs 加密。
- 登录使用 JWT。
- 前端语言选择保存在 `localStorage.lang`。
- 管理后台中的新增按钮使用演示数据快速创建记录，后续可以扩展为完整弹窗表单。

## 开源协议

本项目使用 GNU General Public License v2.0（GPL-2.0）开源，详见 `LICENSE`。
