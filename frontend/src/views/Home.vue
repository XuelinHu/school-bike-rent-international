<template>
  <section>
    <h1>{{ t('app') }}</h1>
    <div class="grid">
      <router-link class="card" to="/bikes"><h3>{{ t('bikes') }}</h3><p class="muted">Campus bikes and station availability</p></router-link>
      <router-link class="card" to="/orders/current"><h3>{{ t('currentOrder') }}</h3><p class="muted">Active rental and return action</p></router-link>
      <router-link class="card" to="/announcements"><h3>{{ t('announcements') }}</h3><p class="muted">Campus rental notices</p></router-link>
      <router-link v-if="auth.user?.role === 'admin'" class="card" to="/admin"><h3>{{ t('dashboard') }}</h3><p class="muted">Management console</p></router-link>
    </div>
  </section>
</template>
<script setup>
import { t } from '../i18n/index.js';
import { authStore as auth } from '../stores/auth.js';
</script>
