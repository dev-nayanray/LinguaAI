import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ObservabilityModule, RequestLoggingMiddleware } from '@linguaai/observability/nestjs';

import { HealthController } from './health/health.controller.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SessionTokenModule } from './session-token/session-token.module.js';
import { SpeechProviderModule } from './speech-provider/speech-provider.module.js';

/**
 * `services/speech-service`'s real modules — `SpeechProviderModule`
 * (STT/TTS adapters, ADR-043) and `SessionTokenModule` (E10 T1, the
 * internal-token verification half of ADR-043's own handoff mechanism;
 * `apps/api`'s `SpeakingModule`, E10 T2, owns the signing half), and
 * `RealtimeModule` (E10 T3, ADR-045 — the WebSocket gateway consuming both).
 */
@Module({
  imports: [
    ObservabilityModule.forRoot('speech-service'),
    SpeechProviderModule,
    SessionTokenModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
