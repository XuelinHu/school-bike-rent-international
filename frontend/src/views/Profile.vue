<template>
  <section>
    <h1>{{ t('profile') }}</h1>
    <form class="form" @submit.prevent="save">
      <input v-model="form.name" :placeholder="t('name')" />
      <input v-model="form.email" :placeholder="t('email')" />
      <input v-model="form.phone" :placeholder="t('phone')" />
      <input v-model="form.nationality" placeholder="Nationality" />
      <select v-model="form.language"><option value="zh-CN">中文</option><option value="en-US">English</option></select>
      <div class="row">
        <button class="btn">{{ t('save') }}</button>
        <router-link class="btn secondary" to="/change-password">{{ t('changePassword') }}</router-link>
      </div>
      <p class="muted">{{ message }}</p>
    </form>

    <section class="card profile-oidc">
      <h2>{{ t('unifiedAccount') }}</h2>
      <p>{{ oidcStatus === null ? t('loading') : oidcStatus ? t('unifiedLinked') : t('unifiedNotLinked') }}</p>
      <p v-if="oidcMessage" :class="oidcMessage === t('unifiedLinked') ? 'form-ok' : 'form-error'">{{ oidcMessage }}</p>
      <button v-if="oidcStatus === false" class="btn" type="button" @click="linkUnifiedAccount">{{ t('linkUnifiedAccount') }}</button>
    </section>
  </section>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';
import { authStore } from '../stores/auth.js';
import { beginOidcLogin } from '../auth/oidc.js';
const message = ref('');
const form = reactive({ name: '', email: '', phone: '', nationality: '', language: 'zh-CN' });
const oidcStatus = ref(null);
const oidcMessage = ref('');
onMounted(async () => {
  try {
    Object.assign(form, await request('/auth/profile'));
    oidcStatus.value = (await authStore.oidcLinked()).linked;
  } catch (error) {
    oidcMessage.value = error.message;
  }
  const result = sessionStorage.getItem('oidc-link-result');
  if (result) oidcMessage.value = result === 'linked' ? t('unifiedLinked') : result;
  sessionStorage.removeItem('oidc-link-result');
});

function linkUnifiedAccount() {
  oidcMessage.value = '';
  beginOidcLogin({ link: true }).catch((error) => { oidcMessage.value = error.message; });
}
async function save() {
  await request('/auth/profile', { method: 'PUT', body: form });
  message.value = 'saved';
}
</script>
