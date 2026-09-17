import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import './assets/style.css';

// 开发期文案自检。生产构建时 import.meta.env.DEV 为 false，整段会被打包器摇掉。
if (import.meta.env.DEV) {
  import('./devcheck.js').then((m) => m.runDevChecks());
}

createApp(App).use(router).mount('#app');
