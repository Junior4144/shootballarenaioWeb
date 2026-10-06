import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/admin/v1': { target: 'http://127.0.0.1:2570', changeOrigin: true } } } });
