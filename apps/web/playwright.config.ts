import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../.test-artifacts/playwright',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { outputFolder: '../../.test-artifacts/playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5189', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'node ../../node_modules/tsx/dist/cli.mjs ../game-server/src/index.ts',
      port: 2569,
      env: { GAME_SERVER_PORT: '2569' },
      reuseExistingServer: false,
    },
    {
      command: 'node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189 --strictPort',
      url: 'http://127.0.0.1:5189',
      env: { VITE_GAME_SERVER_URL: 'ws://127.0.0.1:2569', VITE_SUPABASE_URL: 'https://lkgxpgcmspxekggndzih.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture' },
      reuseExistingServer: false,
    },
  ],
});
