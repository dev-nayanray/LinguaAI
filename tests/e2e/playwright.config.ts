import { defineConfig } from '@playwright/test';

// E1 skeleton scope (T22): health-check journeys only — each app/service
// hits a different port (.env.example), so specs address full URLs
// directly rather than relying on a single shared baseURL.
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 'github' alone only prints step annotations, no artifact — pairing
  // it with 'html' gives e2e.yml something real to upload on failure.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    trace: 'retain-on-failure',
  },
});
