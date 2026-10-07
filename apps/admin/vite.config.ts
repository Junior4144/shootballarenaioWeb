import { defineConfig } from 'vite';
import { liveGuard, liveProxy, liveTarget } from './live-proxy';
export default defineConfig(({ command, mode }) => {
  const live = command === 'serve' && mode === 'live';
  const target = live ? liveTarget(process.env.ADMIN_LIVE_TARGET) : '';
  return {
    base: '/admin/',
    define: { 'import.meta.env.ADMIN_LIVE_TARGET': JSON.stringify(target) },
    plugins: live ? [liveGuard()] : [],
    server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: {
      '^/admin/v1/': live ? liveProxy(target) : { target: 'http://127.0.0.1:2570', changeOrigin: true },
      '^/admin/config(?:\\?|$)': live ? liveProxy(target) : { target: 'http://127.0.0.1:2570', changeOrigin: true },
    } },
  };
});
