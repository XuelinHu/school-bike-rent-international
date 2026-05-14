<template>
  <section>
    <h1>{{ t('history') }}</h1>
    <div class="card" style="overflow:auto">
      <table>
        <thead><tr><th>No.</th><th>Bike</th><th>Status</th><th>Hours</th><th>Total</th></tr></thead>
        <tbody><tr v-for="o in orders" :key="o.id"><td>{{ o.order_no }}</td><td>{{ o.bike_id }}</td><td><span class="status" :class="o.status">{{ o.status }}</span></td><td>{{ o.duration_hours || '-' }}</td><td>￥{{ o.total_amount }}</td></tr></tbody>
      </table>
    </div>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const orders = ref([]);
onMounted(async () => { orders.value = await request('/orders/my'); });
</script>
