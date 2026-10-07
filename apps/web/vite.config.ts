import { defineConfig } from 'vite';
// /admin is a separate Vite app in development and a separate bundle in builds.
export default defineConfig({ server: { proxy: {
  '/admin': { target: 'http://127.0.0.1:5174', changeOrigin: true, ws: true },
} } });
