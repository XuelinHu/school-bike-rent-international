<template>
  <section>
    <div class="row">
      <h1>{{ t('bikes') }}</h1>
      <input v-model="keyword" :placeholder="t('search')" @keyup.enter="search" />
      <select v-model="status" @change="search">
        <option value="">{{ t('all') }}</option>
        <option value="available">{{ t('available') }}</option>
        <option value="rented">{{ t('rented') }}</option>
        <option value="maintenance">{{ t('maintenanceStatus') }}</option>
      </select>
      <button class="btn secondary" @click="search">{{ t('search') }}</button>
    </div>
    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="loading" class="muted">{{ t('loading') }}</p>
    <div class="grid">
      <article v-for="bike in bikes" :key="bike.id" class="card">
        <h3>{{ bike.name || bike.bike_no }}</h3>
        <p>{{ bike.bike_no }} · {{ bike.type }}</p>
        <p><span class="status" :class="bike.status">{{ t(bike.status) }}</span></p>
        <p class="muted">{{ bike.station_name_zh || bike.station_name_en }}</p>
        <p>￥{{ bike.hourly_rate }}/h</p>
        <router-link class="btn" :to="`/bikes/${bike.id}`">{{ t('detail') }}</router-link>
      </article>
    </div>
    <p v-if="!loading && !bikes.length" class="muted">{{ t('noData') }}</p>
    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </section>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue';
import Pagination from '../components/Pagination.vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const bikes = ref([]);
const keyword = ref('');
const status = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const error = ref('');
let requestVersion = 0;

async function load() {
  const version = ++requestVersion;
  const params = new URLSearchParams();
  if (keyword.value) params.set('keyword', keyword.value);
  if (status.value) params.set('status', status.value);
  params.set('page', String(page.value));
  params.set('pageSize', String(pageSize.value));
  // 列表接口统一返回信封 { list, total, page, pageSize }，不再是裸数组
  loading.value = true;
  error.value = '';
  try {
    const data = await request(`/bikes?${params}`);
    if (version !== requestVersion) return;
    bikes.value = data?.list || [];
    total.value = Number(data?.total || 0);
    page.value = Number(data?.page || 1);
    pageSize.value = Number(data?.pageSize || pageSize.value);
  } catch (e) {
    if (version === requestVersion) error.value = e.message;
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function search() {
  if (page.value === 1) load();
  else page.value = 1;
}

onMounted(load);
watch([page, pageSize], load);
</script>
