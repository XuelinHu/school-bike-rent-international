<template>
  <section>
    <h1>{{ t('register') }}</h1>
    <BikeModelPreview v-model="form.model_id" />
    <form class="form" @submit.prevent="submit">
      <input v-model="form.username" :placeholder="t('username')" required />
      <input v-model="form.password" :placeholder="t('password')" type="password" required />
      <input v-model="form.name" :placeholder="t('name')" />
      <input v-model="form.email" :placeholder="t('email')" />
      <input v-model="form.phone" :placeholder="t('phone')" />
      <input v-model="form.student_no" placeholder="Student No." />
      <input v-model="form.nationality" placeholder="Nationality" />
      <label class="field"><span class="field-label">{{ t('language') }}</span>
        <select v-model="form.language">
          <option value="ms-MY">Bahasa Melayu</option><option value="en-US">English</option>
          <option value="vi-VN">Tiếng Việt</option><option value="lo-LA">ພາສາລາວ</option>
        </select>
      </label>
      <button class="btn">{{ t('register') }}</button>
      <p class="muted">{{ message }}</p>
    </form>
  </section>
</template>
<script setup>
import { reactive, ref } from 'vue';
import { request } from '../api/client.js';
import { t, state } from '../i18n/index.js';
import BikeModelPreview from '../components/BikeModelPreview.vue';
const message = ref('');
const form = reactive({ username: '', password: '', name: '', email: '', phone: '', student_no: '', nationality: '', language: state.lang, model_id: null });
async function submit() {
  try {
    await request('/auth/register', { method: 'POST', body: form });
    message.value = 'registered';
  } catch (e) {
    message.value = e.message;
  }
}
</script>
