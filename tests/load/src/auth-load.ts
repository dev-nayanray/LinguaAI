import { randomUUID } from 'node:crypto';

import { runWithConcurrency } from './concurrency-pool.js';
import { computeStats, type LatencyStats } from './percentiles.js';

const TEST_PASSWORD = 'correct horse battery staple load test';

export interface AuthLoadResult {
  register: LatencyStats;
  login: LatencyStats;
  /** So the caller can clean these accounts up afterward. */
  createdEmails: string[];
}

/**
 * The one question E2-T27 must resolve honestly (implementation plan §15):
 * does Argon2id hashing push `/v1/auth/register`/`/v1/auth/login` — both
 * Standard CRUD class per PERFORMANCE.md §3 — over that class's budget?
 * Measures real wall-clock latency against a live `apps/api`, not a mock —
 * a mocked hash call would answer a different question entirely.
 */
export async function runAuthLoadTest(
  apiUrl: string,
  requestCount: number,
  concurrency: number,
): Promise<AuthLoadResult> {
  const emails = Array.from({ length: requestCount }, () => `load-auth-${randomUUID()}@test.local`);

  const registerDurations = await runWithConcurrency(emails, concurrency, async (email) => {
    const start = performance.now();
    const res = await fetch(`${apiUrl}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: TEST_PASSWORD,
        displayName: 'Load Test User',
        locale: 'en-US',
        timezone: 'UTC',
        tosAccepted: true,
        privacyPolicyAccepted: true,
      }),
    });
    const duration = performance.now() - start;
    if (!res.ok) {
      throw new Error(`register failed: ${res.status} ${await res.text()}`);
    }
    return duration;
  });

  const loginDurations = await runWithConcurrency(emails, concurrency, async (email) => {
    const start = performance.now();
    const res = await fetch(`${apiUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });
    const duration = performance.now() - start;
    if (!res.ok) {
      throw new Error(`login failed: ${res.status} ${await res.text()}`);
    }
    return duration;
  });

  return {
    register: computeStats(registerDurations),
    login: computeStats(loginDurations),
    createdEmails: emails,
  };
}
