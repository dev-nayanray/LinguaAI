import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { SPEECH_PROVIDER_CONFIG } from '../src/speech-provider/speech-provider.config.js';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SPEECH_PROVIDER_CONFIG)
      .useValue({ openAiApiKey: 'test-dummy' })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    try {
      await app.close();
    } catch (error) {
      const errors = (error as AggregateError).errors ?? [error];
      const isOtlpFailure = errors.every(
        (e: unknown) => e instanceof Error && (e as Error).message.includes('ECONNREFUSED'),
      );
      if (!isOtlpFailure) {
        throw error;
      }
    }
  });

  it('GET /health returns 200 { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
