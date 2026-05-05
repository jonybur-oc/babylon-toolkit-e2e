import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './services/vault/e2e',
  fullyParallel: false, // signing ceremony tests are sequential
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 2,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30000,
  reporter: [['html'], ['list']],
  globalSetup: require.resolve('./global-setup'),
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
