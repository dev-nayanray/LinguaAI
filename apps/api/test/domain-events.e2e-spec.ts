import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getPrismaClient } from '@linguaai/database';
import {
  createDomainEventsQueue,
  DOMAIN_EVENTS_QUEUE_NAME,
  type DomainEvent,
} from '@linguaai/events';
import cookieParser from 'cookie-parser';
import type { Job } from 'bullmq';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { uniqueTestEmail, validRegisterBody } from './helpers/auth-flow.js';

/**
 * Integration test against real Redis — E2-T20's own required proof that
 * the publisher wiring genuinely works end-to-end, not just against a
 * mocked `Queue` (every unit test in every affected service does that; this
 * is the one test that proves the real thing). Every other event's
 * schema-correctness is proven at the unit level (one assertion per
 * call site, across the affected services' own spec files) — repeating a
 * real-Redis round trip for all 14 events would be redundant once this
 * proves the underlying mechanism (`DomainEventPublisher.publish` →
 * `Queue.add` → a real job landing in Redis with the correct envelope)
 * works at all. A flagged, deliberate scoping decision, not an oversight.
 */
describe('Domain events — real Redis (e2e)', () => {
  let app: INestApplication;
  const setupPrisma = getPrismaClient();
  const createdUserIds: string[] = [];
  let inspectorQueue: ReturnType<typeof createDomainEventsQueue>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error(
        'REDIS_URL is not set — this test requires a real Redis instance (docker-compose.yml).',
      );
    }
    inspectorQueue = createDomainEventsQueue(redisUrl);
  });

  afterAll(async () => {
    await setupPrisma.consentRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await setupPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await setupPrisma.$disconnect();
    await inspectorQueue.close();
    await app.close();
  });

  /** Polls the real queue's waiting jobs until one matching `type`/`userId` shows up, or the timeout elapses — no worker is running in this test process, so a freshly-added job stays in the `waiting` state indefinitely, but `.add()` itself is asynchronous relative to this test's own HTTP call completing. */
  async function findPublishedJob(
    type: string,
    userId: string,
    timeoutMs = 5000,
  ): Promise<Job<DomainEvent>> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const jobs = await inspectorQueue.getJobs(['waiting', 'active', 'completed']);
      const match = jobs.find(
        (job) => job.name === type && (job.data as DomainEvent).userId === userId,
      );
      if (match) {
        return match as Job<DomainEvent>;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      `No job of type "${type}" for userId "${userId}" appeared in the real queue within ${timeoutMs}ms`,
    );
  }

  it('POST /v1/auth/register publishes a real identity.user.registered job to Redis with the correct envelope shape (EVENT_ARCHITECTURE.md §2)', async () => {
    const email = uniqueTestEmail();
    const registerRes = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(validRegisterBody(email));
    expect(registerRes.status).toBe(201);
    const userId = registerRes.body.id as string;
    createdUserIds.push(userId);

    const job = await findPublishedJob('identity.user.registered', userId);

    expect(job.queueName).toBe(DOMAIN_EVENTS_QUEUE_NAME);
    expect(job.data).toEqual(
      expect.objectContaining({
        eventId: expect.any(String) as unknown as string,
        type: 'identity.user.registered',
        version: 1,
        occurredAt: expect.any(String) as unknown as string,
        producedBy: 'apps/api',
        tenantId: null,
        userId,
        payload: { signupSource: 'password' },
      }),
    );

    // Two identity.consent.recorded jobs (TOS + PRIVACY_POLICY) also landed
    // for the same registration — proves the publisher handles multiple
    // sequential publishes within one request correctly, not just one.
    const consentJobs = (await inspectorQueue.getJobs(['waiting', 'active', 'completed'])).filter(
      (j) => j.name === 'identity.consent.recorded' && (j.data as DomainEvent).userId === userId,
    );
    expect(consentJobs).toHaveLength(2);
  });
});
