import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // rawBody: true (E15 T1) -- preserves the exact byte sequence Stripe
  // signed at `req.rawBody`, alongside the normal JSON-parsed `req.body`
  // every other route already relies on; needed for
  // `POST /v1/billing/webhooks/stripe`'s own signature verification
  // (billing.controller.ts).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Required to read the httpOnly refresh-token cookie (E2-T9,
  // /v1/auth/refresh) — res.cookie() (T8, setting it) needs no middleware,
  // but req.cookies (reading it back) does.
  app.use(cookieParser());
  // E2-T22: apps/web/apps/admin (separate origins, :3000/:3001) call this
  // API directly from the browser and must send the httpOnly refresh
  // cookie (`credentials: 'include'`) — a wildcard origin is incompatible
  // with `credentials: true` per the Fetch spec, so the allowed origins are
  // enumerated explicitly from the same APP_URL/ADMIN_URL vars every other
  // part of this codebase already uses (.env.example), read directly at
  // bootstrap the same way `PORT` already is just below, not worth a new
  // config schema module for two static URLs used nowhere else.
  app.enableCors({
    origin: [
      process.env.APP_URL ?? 'http://localhost:3000',
      process.env.ADMIN_URL ?? 'http://localhost:3001',
    ],
    credentials: true,
  });
  // /health is deliberately excluded — see health.controller.ts.
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  // Required for ObservabilityModule's onApplicationShutdown to actually
  // fire (flushes OTel spans/metrics on SIGTERM/SIGINT).
  app.enableShutdownHooks();

  if (process.env.NODE_ENV !== 'production') {
    // API.md §5: OpenAPI spec generated from decorators, published at
    // /v1/docs in non-production environments only.
    const config = new DocumentBuilder()
      .setTitle('LinguaAI API')
      .setDescription('LinguaAI core API (apps/api)')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('v1/docs', app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
}

void bootstrap();
