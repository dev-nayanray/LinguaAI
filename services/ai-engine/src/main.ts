import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ADR-033 (T10): ai-engine's own REST contract now exists
  // (agent-sessions) — same `v1` prefix / non-production-only Swagger
  // convention apps/api's own main.ts already established
  // (API_GUIDELINES.md §11), applied here for the first time.
  // /health is deliberately excluded — see health.controller.ts.
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  // Required for ObservabilityModule's onApplicationShutdown to actually
  // fire (flushes OTel spans/metrics on SIGTERM/SIGINT).
  app.enableShutdownHooks();

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('LinguaAI AI Engine')
      .setDescription('Internal apps/api <-> ai-engine contract (ADR-033)')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('v1/docs', app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 4001;
  await app.listen(port);
}

void bootstrap();
