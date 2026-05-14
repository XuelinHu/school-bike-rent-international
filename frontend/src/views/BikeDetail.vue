<template>
  <section v-if="bike">
    <h1>{{ bike.name || bike.bike_no }}</h1>
    <div class="card">
      <p>{{ bike.bike_no }} · {{ bike.type }}</p>
      <p><span class="status" :class="bike.status">{{ t(bike.status) }}</span></p>
      <p>￥{{ bike.hourly_rate }}/h</p>
      <p class="muted">{{ bike.description }}</p>
      <router-link v-if="bike.status === 'available'" class="btn" :to="`/rent/${bike.id}`">{{ t('rent') }}</router-link>
    </div>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const route = useRoute();
const bike = ref(null);
onMounted(async () => { bike.value = await request(`/bikes/${route.params.id}`); });
</script>
