<template>
  <section>
    <div class="row">
      <h1>{{ t('bikes') }}</h1>
      <input v-model="keyword" :placeholder="t('search')" @keyup.enter="load" />
      <select v-model="status" @change="load">
        <option value="">{{ t('all') }}</option>
        <option value="available">{{ t('available') }}</option>
        <option value="rented">{{ t('rented') }}</option>
        <option value="maintenance">{{ t('maintenanceStatus') }}</option>
      </select>
      <button class="btn secondary" @click="load">{{ t('search') }}</button>
    </div>
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
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const bikes = ref([]);
const keyword = ref('');
const status = ref('');
async function load() {
  const params = new URLSearchParams();
  if (keyword.value) params.set('keyword', keyword.value);
  if (status.value) params.set('status', status.value);
  bikes.value = await request(`/bikes?${params}`);
}
onMounted(load);
</script>
