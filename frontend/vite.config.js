import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 4030,
    proxy: {
      '/api': {
        target: 'http://localhost:8032',
        changeOrigin: true
      }
    }
  }
});
