import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { HealthController } from './health/health.controller.js';
import { SessionTokenModule } from './session-token/session-token.module.js';
import { SpeechProviderModule } from './speech-provider/speech-provider.module.js';

/**
 * `services/speech-service`'s first real modules (E10 T1) — `SpeechProviderModule`
 * (STT/TTS adapters, ADR-043) and `SessionTokenModule` (the internal-token
 * verification half of ADR-043's own handoff mechanism, `apps/api`'s
 * `SpeakingModule`, E10 T2, owns the signing half). The real-time
 * WebSocket gateway (T3) consumes both, not built by this task.
 */
@Module({
  imports: [
    ObservabilityModule.forRoot('speech-service'),
    SpeechProviderModule,
    SessionTokenModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
