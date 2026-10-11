import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 4030,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8032',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 4030,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8032',
        changeOrigin: true
      }
    }
  }
});
