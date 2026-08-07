import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';

/**
 * `AppModule` now wires two real BullMQ `Worker`s (`DomainEventsModule`,
 * `DailyGoalModule`, E7 T2/T3) that start unconditionally on `app.init()`
 * — every e2e spec file that boots this same module gets its own real
 * Worker instance on the same real queue names. `test:e2e:api` runs Jest
 * with `--runInBand` for exactly this reason: without it, this file's own
 * app could still be shutting down its Worker connections while another
 * spec file's own app has already started its own competing Worker on the
 * same queue, producing a real "Connection is closed" race — found while
 * building T3, not a pre-existing flake.
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
