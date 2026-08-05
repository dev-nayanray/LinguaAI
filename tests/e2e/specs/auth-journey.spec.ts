import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

// E2-T22 required acceptance: "Register → login → view-profile E2E journey
// passes." Hits apps/web and the real apps/api directly (same convention as
// health-checks.spec.ts — full URLs, not a shared baseURL, since each app/
// service listens on its own port), assuming both are already running
// (pnpm dev, or CI's own startup step) — this suite starts neither itself.

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

test('register → login → view profile', async ({ page }) => {
  const email = `e2e-${randomUUID()}@test.local`;
  const password = 'correct horse battery staple';
  const displayName = 'Playwright Journey User';

  await page.goto(`${APP_URL}/register`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Password').fill(password);
  await page.getByText('I agree to the Terms of Service and Privacy Policy').click();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(`${APP_URL}/login?registered=1`);
  await expect(page.getByText('Account created — log in to continue.')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL(`${APP_URL}/profile`);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(displayName)).toBeVisible();
  // { exact: true } — 'USER' would otherwise substring-match inside the
  // display name above ("Playwright Journey User").
  await expect(page.getByText('USER', { exact: true })).toBeVisible();

  // A hard reload discards the in-memory access token (Part 12) — the
  // profile page must still render by silently trading the httpOnly
  // refresh cookie for a fresh one, not bounce to /login.
  await page.reload();
  await expect(page).toHaveURL(`${APP_URL}/profile`);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(`${APP_URL}/login`);

  // Logout actually revoked the session — reloading /profile directly now
  // bounces to /login instead of silently re-authenticating.
  await page.goto(`${APP_URL}/profile`);
  await expect(page).toHaveURL(`${APP_URL}/login`);
});
