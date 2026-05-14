<template>
  <section>
    <h1>{{ t('currentOrder') }}</h1>
    <div class="card" v-if="order">
      <h3>{{ order.order_no }}</h3>
      <p>{{ t('bike') }} #{{ order.bike_id }}</p>
      <p>{{ order.start_time }}</p>
      <p><span class="status" :class="order.status">{{ order.status }}</span></p>
      <button class="btn danger" @click="returnBike">{{ t('returnBike') }}</button>
    </div>
    <p v-else class="muted">{{ t('noActiveOrder') }}</p>
    <p class="muted">{{ message }}</p>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const order = ref(null);
const message = ref('');
async function load() { order.value = await request('/orders/current'); }
async function returnBike() {
  if (!confirm(t('confirmReturn'))) return;
  try {
    const returned = await request(`/orders/${order.value.id}/return`, { method: 'PUT', body: { end_station_id: order.value.start_station_id } });
    order.value = null;
    message.value = `${t('completedTotal')}￥${returned.total_amount}`;
  } catch (e) { message.value = e.message; }
}
onMounted(load);
</script>
