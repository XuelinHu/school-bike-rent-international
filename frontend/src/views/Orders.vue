<template>
  <section>
    <h1>{{ t('history') }}</h1>
    <p class="muted">{{ t('paymentMockNote') }}</p>
    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="loading" class="muted">{{ t('loading') }}</p>
    <div class="card" style="overflow:auto">
      <table>
        <thead><tr><th>No.</th><th>Bike</th><th>Status</th><th>Hours</th><th>Total</th><th>{{ t('payment') }}</th></tr></thead>
        <tbody><tr v-for="o in orders" :key="o.id"><td>{{ o.order_no }}</td><td>{{ o.bike_id }}</td><td><span class="status" :class="o.status">{{ o.status }}</span></td><td>{{ o.duration_hours || '-' }}</td><td>￥{{ o.total_amount }}</td><td>
          <span v-if="paidOrders.has(Number(o.id))" class="status completed">{{ t('paymentSuccess') }}</span>
          <div v-else-if="o.status === 'completed'" class="row">
            <button class="btn" :disabled="paying === o.id" @click="pay(o, 'alipay')">{{ t('payAlipay') }}</button>
            <button class="btn secondary" :disabled="paying === o.id" @click="pay(o, 'wechat')">{{ t('payWechat') }}</button>
          </div>
        </td></tr></tbody>
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
const paidOrders = ref(new Set());
const paying = ref(null);
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
    const payments = await request('/payments/my');
    paidOrders.value = new Set((payments || []).map((payment) => Number(payment.order_id)));
  } catch (e) {
    if (version === requestVersion) error.value = e.message;
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

async function pay(order, provider) {
  paying.value = order.id;
  error.value = '';
  try {
    await request(`/payments/orders/${order.id}/pay`, { method: 'POST', body: { provider } });
    paidOrders.value = new Set([...paidOrders.value, Number(order.id)]);
  } catch (e) {
    error.value = e.message;
  } finally {
    paying.value = null;
  }
}

onMounted(load);
watch([page, pageSize], load);
</script>
