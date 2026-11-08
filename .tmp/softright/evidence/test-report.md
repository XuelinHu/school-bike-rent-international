# 国际学生单车租赁系统 V1.0 测试证据索引

## 版本

- Windows 与 Linux 提交：`0d287fe4656cd56cf7849cb513294cbfcb89ff9e`
- Linux 项目：`/ds1/workspace/front/school-bike-rent-international`
- Android 设备：`9d3ed915`

## 服务证据

| 项目 | 实际结果 |
|---|---|
| Windows API | `http://***:8032/api/health` 返回 200 |
| Linux API | PM2 `bike-backend` online，监听 `0.0.0.0:8032` |
| Linux 网页 | PM2 `school-bike-rental-web` online，监听 `0.0.0.0:4030` |
| PostgreSQL | Linux PostgreSQL18 容器，项目配置端口 5433，迁移完成 |
| Ollama | `11434` 可访问，模型目录可读，`qwen3:8b` 业务回答通过 |
| Android | WebView 刷新后显示移除 AI 绘画入口的页面 |

## 自动化与接口

- `backend/npm test`：25 项通过。
- `frontend/npm run build`：构建通过；仅有 Three.js chunk 体积提示。
- 学生：车辆 200，当前订单 200，用户管理 403。
- 管理员：用户、仪表盘、维护均 200。
- 租赁链路：创建订单 `renting`，归还后 `completed`，订单 ID 为 1。
- AI：使用 `qwen3:8b` 查询站点，界面只显示最终回答，不显示内部推理。

## 截图索引

| 文件 | 端 | 功能 |
|---|---|---|
| `mobile-login-final.png` | PC 浏览器移动视口 | 登录页；移动端隐藏开发账号选择 |
| `mobile-home.png` | PC 浏览器移动视口 | 学生首页 |
| `student-bikes.png` | PC 浏览器移动视口 | 车辆列表 |
| `admin-home.png` | PC 浏览器桌面视口 | 管理员首页 |
| `admin-dashboard.png` | PC 浏览器桌面视口 | 管理台菜单和统计 |
| `android-main-refreshed.png` | Android 真机 | WebView 刷新后的首页 |

## 未完成项

教师/普通用户角色、图片识别、完整语音识别与语音合成、APK 重建安装、所有页面和异常状态截图仍待补齐。相关文档只能标记为“草稿/需人工确认”。
