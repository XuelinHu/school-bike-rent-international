<template>
  <section v-if="item">
    <h1>{{ state.lang === 'zh-CN' ? item.title_zh : item.title_en }}</h1>
    <article class="card">{{ state.lang === 'zh-CN' ? item.content_zh : item.content_en }}</article>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { request } from '../api/client.js';
import { state } from '../i18n/index.js';
const route = useRoute();
const item = ref(null);
onMounted(async () => { item.value = await request(`/announcements/${route.params.id}`); });
</script>
