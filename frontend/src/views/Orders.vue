<template>
  <section>
    <h1>{{ t('history') }}</h1>
    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="loading" class="muted">{{ t('loading') }}</p>
    <div class="card" style="overflow:auto">
      <table>
        <thead><tr><th>No.</th><th>Bike</th><th>Status</th><th>Hours</th><th>Total</th></tr></thead>
        <tbody><tr v-for="o in orders" :key="o.id"><td>{{ o.order_no }}</td><td>{{ o.bike_id }}</td><td><span class="status" :class="o.status">{{ o.status }}</span></td><td>{{ o.duration_hours || '-' }}</td><td>￥{{ o.total_amount }}</td></tr></tbody>
        <tbody v-if="!loading && !orders.length"><tr><td colspan="5">{{ t('noData') }}</td></tr></tbody>
      </table>
    </div>
    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </section>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue';
import Pagination from '../components/Pagination.vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const orders = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const error = ref('');
let requestVersion = 0;

async function load() {
  const version = ++requestVersion;
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
  loading.value = true;
  error.value = '';
  try {
    const result = await request(`/orders/my?${params}`);
    if (version !== requestVersion) return;
    orders.value = result?.list || [];
    total.value = Number(result?.total || 0);
    page.value = Number(result?.page || 1);
    pageSize.value = Number(result?.pageSize || pageSize.value);
  } catch (e) {
    if (version === requestVersion) error.value = e.message;
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

onMounted(load);
watch([page, pageSize], load);
</script>
