import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', outputDir: '../../.test-artifacts/admin', workers: 1, timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5191', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node --import tsx ../admin-api/src/index.ts', url: 'http://127.0.0.1:2570/healthz', reuseExistingServer: false, env: { ADMIN_AUTH_MODE: 'local', ADMIN_LOCAL_TOKEN: 'local-browser-test-token-not-a-hosted-credential', ADMIN_INVENTORY_PROVIDER: 'fixture' } },
    { command: 'node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191 --strictPort', url: 'http://127.0.0.1:5191', reuseExistingServer: false },
  ],
});
