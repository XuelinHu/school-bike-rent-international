<template>
  <section>
    <h1>{{ t('login') }}</h1>
    <form class="form" @submit.prevent="submit">
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
