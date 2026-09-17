<template>
  <section>
    <h1>{{ t('changePassword') }}</h1>

    <form class="form card" @submit.prevent="submit">
      <label class="field">
        <span class="field-label">{{ t('oldPassword') }} <em class="req">*</em></span>
        <input v-model="form.oldPassword" type="password" autocomplete="current-password" />
      </label>

      <label class="field">
        <span class="field-label">{{ t('newPassword') }} <em class="req">*</em></span>
        <input v-model="form.newPassword" type="password" autocomplete="new-password" />
        <small class="muted">{{ t('newPasswordHint') }}</small>
      </label>

      <label class="field">
        <span class="field-label">{{ t('confirmPassword') }} <em class="req">*</em></span>
        <input v-model="form.confirmPassword" type="password" autocomplete="new-password" />
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="done" class="form-ok">{{ t('changePasswordOk') }}</p>

      <div class="row">
        <button class="btn" type="submit" :disabled="busy">{{ busy ? t('saving') : t('save') }}</button>
        <router-link class="btn secondary" to="/profile">{{ t('cancel') }}</router-link>
      </div>
    </form>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { request } from '../api/client.js';
import { authStore } from '../stores/auth.js';
import { t } from '../i18n/index.js';

const router = useRouter();
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const error = ref('');
const done = ref(false);
const busy = ref(false);

async function submit() {
  error.value = '';
  done.value = false;

  if (form.newPassword.length < 6) return (error.value = t('newPasswordHint'));
  if (form.newPassword !== form.confirmPassword) return (error.value = t('passwordMismatch'));

  busy.value = true;
  try {
    await request('/auth/password', { method: 'PUT', body: { oldPassword: form.oldPassword, newPassword: form.newPassword } });
    done.value = true;
    // 后端没有让旧 token 失效的机制，所以这里主动登出，避免用户以为"改完还登着"是正常的
    setTimeout(() => {
      authStore.logout();
      router.push('/login');
    }, 1200);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
