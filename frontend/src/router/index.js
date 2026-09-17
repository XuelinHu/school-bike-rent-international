import { createRouter, createWebHistory } from 'vue-router';
import { authStore } from '../stores/auth.js';
import Login from '../views/Login.vue';
import Register from '../views/Register.vue';
import Home from '../views/Home.vue';
import Bikes from '../views/Bikes.vue';
import BikeDetail from '../views/BikeDetail.vue';
import RentConfirm from '../views/RentConfirm.vue';
import CurrentOrder from '../views/CurrentOrder.vue';
import Orders from '../views/Orders.vue';
import Profile from '../views/Profile.vue';
import Announcements from '../views/Announcements.vue';
import AnnouncementDetail from '../views/AnnouncementDetail.vue';
import AdminList from '../views/AdminList.vue';
import AdminAiModels from '../views/AdminAiModels.vue';
import Dashboard from '../views/Dashboard.vue';
import ForgotPassword from '../views/ForgotPassword.vue';
import ChangePassword from '../views/ChangePassword.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/forgot-password', component: ForgotPassword },
  { path: '/change-password', component: ChangePassword, meta: { auth: true } },
  { path: '/bikes', component: Bikes, meta: { auth: true } },
  { path: '/bikes/:id', component: BikeDetail, meta: { auth: true } },
  { path: '/rent/:id', component: RentConfirm, meta: { auth: true } },
  { path: '/orders/current', component: CurrentOrder, meta: { auth: true } },
  { path: '/orders/history', component: Orders, meta: { auth: true } },
  { path: '/profile', component: Profile, meta: { auth: true } },
  { path: '/announcements', component: Announcements },
  { path: '/announcements/:id', component: AnnouncementDetail },
  { path: '/admin', component: Dashboard, meta: { auth: true, admin: true } },
  { path: '/admin/users', component: AdminList, props: { type: 'users' }, meta: { auth: true, admin: true } },
  { path: '/admin/bikes', component: AdminList, props: { type: 'bikes' }, meta: { auth: true, admin: true } },
  { path: '/admin/orders', component: AdminList, props: { type: 'orders' }, meta: { auth: true, admin: true } },
  { path: '/admin/stations', component: AdminList, props: { type: 'stations' }, meta: { auth: true, admin: true } },
  // 维护菜单后端是 allow('admin','staff')，前端过去只判 auth，学生能点进来然后吃 403 空表
  { path: '/admin/maintenance', component: AdminList, props: { type: 'maintenance' }, meta: { auth: true, roles: ['admin', 'staff'] } },
  { path: '/admin/announcements', component: AdminList, props: { type: 'announcements' }, meta: { auth: true, admin: true } },
  // 模型管理是 admin-only：加载/卸载会动整台机器的显存，影响同机其它项目
  { path: '/admin/ai-models', component: AdminAiModels, meta: { auth: true, admin: true } }
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (to.meta.auth && !authStore.isAuthed) return '/login';
  if (to.meta.admin && authStore.user?.role !== 'admin') return '/';
  // roles 是比 admin 更细的一层：维护菜单要放行 staff
  if (to.meta.roles && !to.meta.roles.includes(authStore.user?.role)) return '/';
  return true;
});

export default router;
