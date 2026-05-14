<template>
  <section>
    <div class="row">
      <h1>{{ title }}</h1>
      <button v-if="canCreate" class="btn" @click="createSample">{{ t('create') }}</button>
    </div>
    <p class="muted">{{ message }}</p>
    <div class="card" style="overflow:auto">
      <table>
        <thead>
          <tr><th v-for="h in headers" :key="h">{{ t(h) }}</th><th>{{ t('action') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td v-for="h in headers" :key="h">{{ format(row[h]) }}</td>
            <td>
              <button v-if="type === 'maintenance' && row.status === 'processing'" class="btn" @click="finish(row)">{{ t('finish') }}</button>
              <button v-if="deletable" class="btn danger" @click="remove(row)">{{ t('delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';

const props = defineProps({ type: { type: String, required: true } });
const rows = ref([]);
const message = ref('');
const title = computed(() => t(props.type));
const endpoints = {
  users: '/users',
  bikes: '/bikes',
  orders: '/orders',
  stations: '/stations',
  maintenance: '/maintenance',
  announcements: '/announcements'
};
const headerMap = {
  users: ['id', 'username', 'name', 'role', 'status'],
  bikes: ['id', 'bike_no', 'name', 'type', 'status', 'hourly_rate'],
  orders: ['id', 'order_no', 'username', 'bike_no', 'status', 'total_amount'],
  stations: ['id', 'name_zh', 'name_en', 'capacity'],
  maintenance: ['id', 'bike_no', 'staff_name', 'status', 'content'],
  announcements: ['id', 'title_zh', 'title_en', 'status']
};
const headers = computed(() => headerMap[props.type] || ['id']);
const deletable = computed(() => ['users', 'bikes', 'stations', 'announcements'].includes(props.type));
const canCreate = computed(() => ['bikes', 'stations', 'maintenance', 'announcements'].includes(props.type));

async function load() {
  rows.value = await request(endpoints[props.type]);
}
function format(value) {
  if (value == null) return '';
  if (typeof value === 'string' && value.length > 60) return `${value.slice(0, 60)}...`;
  return value;
}
async function remove(row) {
  if (!confirm('Delete this item?')) return;
  await request(`${endpoints[props.type]}/${row.id}`, { method: 'DELETE' });
  await load();
}
async function finish(row) {
  await request(`/maintenance/${row.id}/finish`, { method: 'PUT' });
  await load();
}
async function createSample() {
  const samples = {
    bikes: { bike_no: `BIKE-${Date.now()}`, name: 'New Bike', type: 'standard', status: 'available', station_id: 1, hourly_rate: 2, image_url: '', description: 'Created from admin' },
    stations: { name_zh: '新站点', name_en: 'New Station', address_zh: '校园内', address_en: 'Campus', latitude: 31.23, longitude: 121.47, capacity: 20 },
    maintenance: { bike_id: 1, content: 'Routine inspection' },
    announcements: { title_zh: '新公告', title_en: 'New Notice', content_zh: '公告内容', content_en: 'Notice content', status: 'published' }
  };
  try {
    await request(endpoints[props.type], { method: 'POST', body: samples[props.type] });
    await load();
  } catch (e) {
    message.value = e.message;
  }
}
onMounted(load);
watch(() => props.type, load);
</script>
