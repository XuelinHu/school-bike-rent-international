# 国际化学生单车租赁软件生成需求

## 技术栈

- 前端：H5，Vue3 + Vite，移动端优先，支持中文和英文国际化。
- 后端：Node.js + Express.js，RESTful API，JWT 鉴权，bcrypt 密码加密，mysql2 连接 MySQL，dotenv 管理环境变量，cors 跨域。
- 数据库：MySQL。

```env
DB_HOST=mysql_1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=Java@c1024
DB_NAME=student_bike_rental
```

## 系统名称

国际化学生单车租赁软件。

## 用户角色

- 学生用户：注册、登录、修改资料、查看单车、租赁、归还、查看订单、查看费用明细、查看公告、切换语言。
- 管理员：管理用户、单车、订单、站点、维护记录、公告，查看统计。
- 运维人员：查看待维护车辆、更新车辆状态、新增维护记录。

## 核心模块

- 用户认证模块
- 学生用户模块
- 单车管理模块
- 租赁订单模块
- 站点模块
- 维护模块
- 公告模块
- 国际化模块
- 管理后台模块

## 数据表

- users
- bikes
- stations
- rental_orders
- maintenance_records
- announcements

## 权限控制

- 未登录用户：注册、登录、公告列表、公告详情。
- 学生用户：单车列表、租车、还车、我的订单、个人信息。
- 管理员：全部管理接口。
- 运维人员：维护相关接口和车辆状态更新。

## 交付要求

一次性生成完整可运行项目代码，包含后端、前端、数据库 SQL、初始化数据、README 和运行说明。
