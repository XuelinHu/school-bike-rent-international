<template>
  <section>
    <h1>{{ t('login') }}</h1>
    <form class="form" @submit.prevent="submit">
      <label v-if="isDev" class="field dev-test-account">
        <span class="field-label">{{ t('devTestAccount') }}</span>
        <select v-model="selectedAccount" @change="pickAccount">
          <option value="">{{ t('pleaseSelect') }}</option>
          <optgroup :label="t('student')">
            <option v-for="account in studentAccounts" :key="account.username" :value="account.username">{{ account.username }}</option>
          </optgroup>
          <optgroup :label="t('admin')">
            <option v-for="account in adminAccounts" :key="account.username" :value="account.username">{{ account.username }}</option>
          </optgroup>
        </select>
      </label>
      <input v-model="form.username" :placeholder="t('username')" required />
      <input v-model="form.password" :placeholder="t('password')" type="password" required />
      <button class="btn">{{ t('login') }}</button>
      <button class="btn secondary oidc-login" type="button" @click="startOidcLogin">{{ t('unifiedLogin') }}</button>
      <div class="row">
        <router-link to="/register">{{ t('register') }}</router-link>
        <router-link to="/forgot-password">{{ t('forgotPassword') }}</router-link>
      </div>
      <p v-if="message" class="form-error">{{ message }}</p>
    </form>
  </section>
</template>
<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { authStore } from '../stores/auth.js';
import { t } from '../i18n/index.js';
import { beginOidcLogin } from '../auth/oidc.js';
const router = useRouter();
const message = ref('');
const form = reactive({ username: '', password: '' });
const selectedAccount = ref('');
// The local preview server is also used as the Android development target.
// Keep test credentials hidden on any non-local host, even if a preview build is used.
const isDev = import.meta.env.DEV
  || import.meta.env.VITE_SHOW_DEV_ACCOUNTS === '1'
  || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const studentAccounts = Array.from({ length: 10 }, (_, index) => {
  const n = String(index + 1).padStart(2, '0');
  return { username: `student${n}`, password: `Student-${n}-Bike!2026` };
});
const adminAccounts = [
  { username: 'admin01', password: 'Admin-01-Bike!2026' },
  { username: 'admin02', password: 'Admin-02-Bike!2026' }
];
function pickAccount() {
  const account = [...studentAccounts, ...adminAccounts].find((item) => item.username === selectedAccount.value);
  if (account) Object.assign(form, { username: account.username, password: account.password });
}
onMounted(() => {
  message.value = localStorage.getItem('oidc-login-error') || '';
  localStorage.removeItem('oidc-login-error');
});

function startOidcLogin() {
  message.value = '';
  beginOidcLogin().catch((error) => { message.value = error.message; });
}

async function submit() {
  try {
    await authStore.login(form);
    router.push('/');
  } catch (e) {
    message.value = e.message;
  }
}
</script>
