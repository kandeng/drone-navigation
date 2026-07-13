import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../components'),
      '@shared-composables': resolve(__dirname, '../composables'),
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: ['..', './'],
    },
  },
});
