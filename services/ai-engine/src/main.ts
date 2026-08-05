import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Required for ObservabilityModule's onApplicationShutdown to actually
  // fire (flushes OTel spans/metrics on SIGTERM/SIGINT).
  app.enableShutdownHooks();

  const port = process.env.PORT ? Number(process.env.PORT) : 4001;
  await app.listen(port);
}

void bootstrap();
