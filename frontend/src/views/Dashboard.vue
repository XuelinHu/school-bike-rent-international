<template>
  <section>
    <h1>{{ t('dashboard') }}</h1>
    <div class="grid">
      <div class="card"><h3>{{ stats.users }}</h3><p>{{ t('users') }}</p></div>
      <div class="card"><h3>{{ stats.bikes }}</h3><p>{{ t('bikes') }}</p></div>
      <div class="card"><h3>{{ stats.activeOrders }}</h3><p>{{ t('currentOrder') }}</p></div>
      <div class="card"><h3>￥{{ stats.totalIncome }}</h3><p>Total income</p></div>
    </div>
    <div class="grid" style="margin-top:12px">
      <router-link class="card" to="/admin/users">{{ t('users') }}</router-link>
      <router-link class="card" to="/admin/bikes">{{ t('bikes') }}</router-link>
      <router-link class="card" to="/admin/orders">{{ t('orders') }}</router-link>
      <router-link class="card" to="/admin/stations">{{ t('stations') }}</router-link>
      <router-link class="card" to="/admin/maintenance">{{ t('maintenance') }}</router-link>
      <router-link class="card" to="/admin/announcements">{{ t('announcements') }}</router-link>
    </div>
  </section>
</template>
<script setup>
import { onMounted, reactive } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const stats = reactive({ users: 0, bikes: 0, activeOrders: 0, totalIncome: 0 });
onMounted(async () => Object.assign(stats, await request('/dashboard/stats')));
</script>
