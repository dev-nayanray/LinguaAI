import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';

// Registered only in this test module, never in the real AppModule — a
// real API has no legitimate "please throw" route. This is how the
// acceptance criterion ("a deliberately thrown error returns the standard
// envelope") is proven against the real, fully-wired app (global filter +
// middleware included) without adding a permanent debug endpoint.
@Controller('test-only')
class ThrowingTestController {
  @Get('boom')
  boom(): never {
    throw new Error('deliberate test error');
  }
}

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ThrowingTestController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health'] });
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

  it('a deliberately thrown error returns the standard error envelope, including a requestId', async () => {
    const res = await request(app.getHttpServer()).get('/v1/test-only/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown as string,
      },
    });
  });
});
