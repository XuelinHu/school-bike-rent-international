<template>
  <section>
    <h1>{{ t('profile') }}</h1>
    <form class="form" @submit.prevent="save">
      <input v-model="form.name" :placeholder="t('name')" />
      <input v-model="form.email" :placeholder="t('email')" />
      <input v-model="form.phone" :placeholder="t('phone')" />
      <input v-model="form.nationality" placeholder="Nationality" />
      <select v-model="form.language"><option value="zh-CN">中文</option><option value="en-US">English</option></select>
      <button class="btn">{{ t('save') }}</button>
      <p class="muted">{{ message }}</p>
    </form>
  </section>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
const message = ref('');
const form = reactive({ name: '', email: '', phone: '', nationality: '', language: 'zh-CN' });
onMounted(async () => Object.assign(form, await request('/auth/profile')));
async function save() {
  await request('/auth/profile', { method: 'PUT', body: form });
  message.value = 'saved';
}
</script>
