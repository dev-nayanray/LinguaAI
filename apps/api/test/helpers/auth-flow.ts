import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export function uniqueTestEmail(): string {
  return `e2e-${randomUUID()}@test.local`;
}

export const TEST_PASSWORD = 'correct horse battery staple';

export function validRegisterBody(email: string): Record<string, unknown> {
  return {
    email,
    password: TEST_PASSWORD,
    displayName: 'E2E Test User',
    locale: 'en-US',
    timezone: 'UTC',
    tosAccepted: true,
    privacyPolicyAccepted: true,
  };
}

export function extractRefreshToken(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const refreshCookie = cookies?.find((c) => c.startsWith('refreshToken='));
  if (!refreshCookie) {
    throw new Error('No refreshToken cookie in response');
  }
  const value = refreshCookie.split(';')[0]?.split('=')[1];
  if (!value) {
    throw new Error('Malformed refreshToken cookie');
  }
  return value;
}

export interface RegisteredSession {
  email: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

/** Registers a fresh user and logs in, returning everything a session-scoped test needs. */
export async function registerAndLogin(app: INestApplication): Promise<RegisteredSession> {
  const email = uniqueTestEmail();
  const registerRes = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send(validRegisterBody(email));
  const loginRes = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: TEST_PASSWORD });

  return {
    email,
    userId: registerRes.body.id as string,
    accessToken: loginRes.body.accessToken as string,
    refreshToken: extractRefreshToken(loginRes),
  };
}
