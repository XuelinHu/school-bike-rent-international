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
import Dashboard from '../views/Dashboard.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
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
  { path: '/admin/maintenance', component: AdminList, props: { type: 'maintenance' }, meta: { auth: true } },
  { path: '/admin/announcements', component: AdminList, props: { type: 'announcements' }, meta: { auth: true, admin: true } }
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (to.meta.auth && !authStore.isAuthed) return '/login';
  if (to.meta.admin && authStore.user?.role !== 'admin') return '/';
  return true;
});

export default router;
