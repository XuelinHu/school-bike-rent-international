<template>
  <section>
    <h1>{{ t('resetPassword') }}</h1>

    <!-- 第一步：身份核验 -->
    <form v-if="step === 'verify'" class="form card" @submit.prevent="verify">
      <p class="muted">{{ t('verifyHint') }}</p>

      <label class="field">
        <span class="field-label">{{ t('username') }} <em class="req">*</em></span>
        <input v-model="form.username" autocomplete="username" />
      </label>
      <label class="field">
        <span class="field-label">{{ t('student_no') }} <em class="req">*</em></span>
        <input v-model="form.student_no" />
      </label>
      <label class="field">
        <span class="field-label">{{ t('email') }} <em class="req">*</em></span>
        <input v-model="form.email" type="email" autocomplete="email" />
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>

      <div class="row">
        <button class="btn" type="submit" :disabled="busy">{{ busy ? t('loading') : t('verify') }}</button>
        <router-link class="btn secondary" to="/login">{{ t('backToLogin') }}</router-link>
      </div>
    </form>

    <!-- 第二步：设置新密码。resetToken 是上一步换来的 10 分钟一次性令牌 -->
    <form v-else class="form card" @submit.prevent="reset">
      <p class="muted">{{ t('setNewPassword') }}</p>

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
      <p v-if="done" class="form-ok">{{ t('resetOk') }}</p>

      <div class="row">
        <button class="btn" type="submit" :disabled="busy || done">{{ busy ? t('saving') : t('resetPassword') }}</button>
        <router-link class="btn secondary" to="/login">{{ t('backToLogin') }}</router-link>
      </div>
    </form>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';

const router = useRouter();
const step = ref('verify');
const resetToken = ref('');
const error = ref('');
const done = ref(false);
const busy = ref(false);
const form = reactive({ username: '', student_no: '', email: '', newPassword: '', confirmPassword: '' });

async function verify() {
  error.value = '';
  if (!form.username || !form.student_no || !form.email) return (error.value = t('fieldRequired'));
  busy.value = true;
  try {
    const data = await request('/auth/forgot-password/verify', {
      method: 'POST',
      body: { username: form.username, student_no: form.student_no, email: form.email }
    });
    resetToken.value = data.resetToken;
    step.value = 'reset';
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function reset() {
  error.value = '';
  if (form.newPassword.length < 6) return (error.value = t('newPasswordHint'));
  if (form.newPassword !== form.confirmPassword) return (error.value = t('passwordMismatch'));
  busy.value = true;
  try {
    await request('/auth/forgot-password/reset', {
      method: 'POST',
      body: { resetToken: resetToken.value, newPassword: form.newPassword }
    });
    done.value = true;
    setTimeout(() => router.push('/login'), 1500);
  } catch (e) {
    error.value = e.message;
    // 令牌过期/无效时退回第一步重来，否则用户会卡在一个永远失败的表单上
    if (/expired|invalid/i.test(e.message)) {
      step.value = 'verify';
      resetToken.value = '';
    }
  } finally {
    busy.value = false;
  }
}
</script>
