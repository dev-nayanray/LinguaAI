import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { PRONUNCIATION_PROVIDER } from '../src/pronunciation-provider/pronunciation-provider.config.js';
import type { PronunciationProvider } from '../src/pronunciation-provider/pronunciation-provider.interface.js';
import { SPEECH_PROVIDER_CONFIG } from '../src/speech-provider/speech-provider.config.js';

/**
 * `PRONUNCIATION_PROVIDER` is stubbed at the boundary — no live Azure
 * Speech credentials exist in this environment (RISK_REGISTER R-88, the
 * same standing limitation `SttProvider`/`TtsProvider`'s own e2e stubs
 * already carry). This suite proves the real HTTP round trip through
 * `AppModule` -> `PronunciationScoringController` -> `ZodValidationPipe` ->
 * the provider interface, not the real Azure SDK call itself (unit-tested
 * separately, `azure-pronunciation-assessment.provider.spec.ts`).
 */
function fakePronunciationProvider(): PronunciationProvider & {
  scorePronunciation: jest.Mock;
} {
  return {
    name: 'azure',
    scorePronunciation: jest.fn().mockResolvedValue({
      overallScore: 88,
      accuracyScore: 90,
      fluencyScore: 85,
      completenessScore: 95,
      words: [{ word: 'hola', accuracyScore: 90, errorType: 'NONE', phonemes: [] }],
    }),
  };
}

describe('PronunciationScoringController (e2e)', () => {
  let app: INestApplication;
  const provider = fakePronunciationProvider();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SPEECH_PROVIDER_CONFIG)
      .useValue({ openAiApiKey: 'test-dummy' })
      .overrideProvider(PRONUNCIATION_PROVIDER)
      .useValue(provider)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterEach(() => {
    provider.scorePronunciation.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /v1/pronunciation/score decodes the base64 audio, calls the provider, and returns its real result', async () => {
    const audioBase64 = Buffer.from('raw-audio-bytes').toString('base64');

    const res = await request(app.getHttpServer()).post('/v1/pronunciation/score').send({
      audio: audioBase64,
      referenceText: 'hola',
      languageCode: 'es-ES',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      overallScore: 88,
      accuracyScore: 90,
      fluencyScore: 85,
      completenessScore: 95,
      words: [{ word: 'hola', accuracyScore: 90, errorType: 'NONE', phonemes: [] }],
    });
    expect(provider.scorePronunciation).toHaveBeenCalledWith(
      Buffer.from('raw-audio-bytes'),
      'hola',
      'es-ES',
    );
  });

  it('rejects a malformed body (missing referenceText) with 400, never calling the provider', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/pronunciation/score')
      .send({ audio: Buffer.from('x').toString('base64'), languageCode: 'es-ES' });

    expect(res.status).toBe(400);
    expect(provider.scorePronunciation).not.toHaveBeenCalled();
  });
});
