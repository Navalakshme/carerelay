import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/browser-server.mjs',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
  reporter: process.env.CI ? 'github' : 'list',
});
