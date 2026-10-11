import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './assets/style.css';
import { initializeOidc, oidc } from './auth/oidc.js';
import { authStore } from './stores/auth.js';

// 开发期文案自检。生产构建时 import.meta.env.DEV 为 false，整段会被打包器摇掉。
if (import.meta.env.DEV) {
  import('./devcheck.js').then((m) => m.runDevChecks());
}

async function start() {
  let completedLogin = false;
  try {
    const authenticated = await initializeOidc();
    if (authenticated && sessionStorage.getItem('oidc-link-pending') === '1') {
      try {
        await authStore.linkOidc(oidc.token);
        sessionStorage.setItem('oidc-link-result', 'linked');
      } catch (error) {
        sessionStorage.setItem('oidc-link-result', error.message);
      } finally {
        sessionStorage.removeItem('oidc-link-pending');
      }
    } else if (authenticated && sessionStorage.getItem('oidc-login-pending') === '1') {
      try {
        await authStore.loginWithOidc(oidc.token);
        completedLogin = true;
      } catch (error) {
        localStorage.setItem('oidc-login-error', error.message);
      } finally {
        sessionStorage.removeItem('oidc-login-pending');
      }
    } else if (!authenticated) {
      sessionStorage.removeItem('oidc-link-pending');
      sessionStorage.removeItem('oidc-login-pending');
    }
  } catch (error) {
    localStorage.setItem('oidc-login-error', error.message || 'Unified sign-in is unavailable');
    sessionStorage.removeItem('oidc-link-pending');
    sessionStorage.removeItem('oidc-login-pending');
  }

  createApp(App).use(router).mount('#app');
  if (completedLogin) {
    await router.isReady();
    router.replace(router.currentRoute.value.query.redirect || '/');
  }
}

start();
