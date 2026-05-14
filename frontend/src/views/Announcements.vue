<template>
  <section>
    <h1>{{ t('announcements') }}</h1>
    <div class="grid">
      <router-link v-for="a in list" :key="a.id" class="card" :to="`/announcements/${a.id}`">
        <h3>{{ state.lang === 'zh-CN' ? a.title_zh : a.title_en }}</h3>
        <p class="muted">{{ a.created_at }}</p>
      </router-link>
    </div>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../api/client.js';
import { state, t } from '../i18n/index.js';
const list = ref([]);
onMounted(async () => { list.value = await request('/announcements'); });
</script>
