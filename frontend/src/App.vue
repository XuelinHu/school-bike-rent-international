<template>
  <div class="app-shell">
    <header class="topbar">
      <router-link class="brand" to="/">{{ t('app') }}</router-link>
      <nav class="toolbar">
        <router-link to="/">{{ t('home') }}</router-link>
        <router-link v-if="auth.user" to="/bikes">{{ t('bikes') }}</router-link>
        <router-link v-if="auth.user" to="/orders/current">{{ t('currentOrder') }}</router-link>
        <router-link v-if="auth.user" to="/orders/history">{{ t('history') }}</router-link>
        <router-link to="/announcements">{{ t('announcements') }}</router-link>
        <router-link v-if="auth.user" to="/profile">{{ t('profile') }}</router-link>
        <router-link v-if="auth.user?.role === 'admin'" to="/admin">{{ t('dashboard') }}</router-link>
        <!-- staff 进不了 /admin（那里是 admin-only 的统计页），给一条直达维护菜单的入口 -->
        <router-link v-if="auth.user?.role === 'staff'" to="/admin/maintenance">{{ t('maintenance') }}</router-link>
        <router-link v-if="!auth.user" to="/login">{{ t('login') }}</router-link>
        <button v-if="auth.user" @click="logout">{{ t('logout') }}</button>
        <select :value="state.lang" @change="setLang($event.target.value)">
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
        </select>
      </nav>
    </header>
    <main class="content">
      <router-view />
    </main>

    <!-- 智能助手：悬浮球 + 弹框。挂在 shell 上而不是某个页面里，
         这样切路由时对话不会被卸载掉（模型冷加载要几十秒，切页就丢太亏了） -->
    <ChatWidget />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { authStore as auth } from './stores/auth.js';
import { state, t, setLang } from './i18n/index.js';
import ChatWidget from './components/ChatWidget.vue';

const router = useRouter();
function logout() {
  auth.logout();
  router.push('/login');
}
</script>
