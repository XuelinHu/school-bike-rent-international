<template>
  <section>
    <h1>{{ t('announcements') }}</h1>
    <p v-if="error" class="form-error">{{ error }}</p>
    <p v-if="loading" class="muted">{{ t('loading') }}</p>
    <div class="grid">
      <router-link v-for="a in list" :key="a.id" class="card" :to="`/announcements/${a.id}`">
        <h3>{{ state.lang === 'zh-CN' ? a.title_zh : a.title_en }}</h3>
        <p class="muted">{{ a.created_at }}</p>
      </router-link>
    </div>
    <p v-if="!loading && !list.length" class="muted">{{ t('noData') }}</p>
    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </section>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue';
import Pagination from '../components/Pagination.vue';
import { request } from '../api/client.js';
import { state, t } from '../i18n/index.js';
const list = ref([]);
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
    // 列表接口统一返回信封 { list, total, page, pageSize }
    const data = await request(`/announcements?${params}`);
    if (version !== requestVersion) return;
    list.value = data?.list || [];
    total.value = Number(data?.total || 0);
    page.value = Number(data?.page || 1);
    pageSize.value = Number(data?.pageSize || pageSize.value);
  } catch (e) {
    if (version === requestVersion) error.value = e.message;
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

onMounted(load);
watch([page, pageSize], load);
</script>
