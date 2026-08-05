import { expect, test } from '@playwright/test';

// E1 T22 acceptance: "Playwright suite hits each skeleton app's
// health/status page successfully." Backend apps/services (NestJS)
// expose a JSON /health endpoint (T13/T16); web/admin (Next.js) have no
// dedicated health route yet, so their check is that the root page
// renders (T14's own acceptance bar) rather than a JSON status check.

const apiServices = [
  { name: 'api', url: process.env.API_URL ?? 'http://localhost:4000' },
  { name: 'ai-engine', url: process.env.AI_ENGINE_URL ?? 'http://localhost:4001' },
  { name: 'speech-service', url: process.env.SPEECH_SERVICE_URL ?? 'http://localhost:4002' },
  {
    name: 'recommendation-engine',
    url: process.env.RECOMMENDATION_ENGINE_URL ?? 'http://localhost:4003',
  },
  {
    name: 'notification-service',
    url: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:4004',
  },
  { name: 'analytics-service', url: process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:4005' },
];

const webApps = [
  { name: 'web', url: process.env.APP_URL ?? 'http://localhost:3000' },
  { name: 'admin', url: process.env.ADMIN_URL ?? 'http://localhost:3001' },
];

for (const { name, url } of apiServices) {
  test(`${name}: /health responds ok`, async ({ request }) => {
    const response = await request.get(`${url}/health`);
    expect(response.status(), `${name} /health status`).toBe(200);
    const body = (await response.json()) as { status?: string };
    expect(body.status, `${name} /health body.status`).toBe('ok');
  });
}

for (const { name, url } of webApps) {
  test(`${name}: root page renders`, async ({ page }) => {
    const response = await page.goto(url);
    expect(response?.ok(), `${name} root page HTTP status`).toBe(true);
    // Not asserting specific content — E1's skeleton pages have no fixed
    // copy yet (T14/T15). A successful navigation with no error overlay
    // is the health/status signal at this stage.
    await expect(page.locator('body')).toBeVisible();
  });
}
