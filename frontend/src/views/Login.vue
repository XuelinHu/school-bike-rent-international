<template>
  <section>
    <h1>{{ t('login') }}</h1>
    <form class="form" @submit.prevent="submit">
      <input v-model="form.username" :placeholder="t('username')" required />
      <input v-model="form.password" :placeholder="t('password')" type="password" required />
      <button class="btn">{{ t('login') }}</button>
      <router-link to="/register">{{ t('register') }}</router-link>
      <p class="muted">{{ message }}</p>
    </form>
  </section>
</template>
<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { authStore } from '../stores/auth.js';
import { t } from '../i18n/index.js';
const router = useRouter();
const message = ref('');
const form = reactive({ username: 'student', password: 'student123456' });
async function submit() {
  try {
    await authStore.login(form);
    router.push('/');
  } catch (e) {
    message.value = e.message;
  }
}
</script>
