<template>
  <section>
    <h1>{{ t('rent') }}</h1>
    <div class="card" v-if="bike">
      <h3>{{ bike.name || bike.bike_no }}</h3>
      <p>￥{{ bike.hourly_rate }}/h</p>
      <button class="btn" @click="rent">{{ t('rent') }}</button>
      <p class="muted">{{ message }}</p>
    </div>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const route = useRoute();
const router = useRouter();
const bike = ref(null);
const message = ref('');
onMounted(async () => { bike.value = await request(`/bikes/${route.params.id}`); });
async function rent() {
  if (!confirm('Confirm rental?')) return;
  try {
    await request('/orders/rent', { method: 'POST', body: { bike_id: Number(route.params.id), start_station_id: bike.value.station_id } });
    router.push('/orders/current');
  } catch (e) {
    message.value = e.message;
  }
}
</script>
