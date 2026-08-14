import { Module } from '@nestjs/common';

import { AnalyticsEventDispatcher } from './analytics-event-dispatcher.service.js';

/**
 * The real domain module behind `DomainEventsModule`'s own `Worker` (E17
 * T1) — holds `AnalyticsEventDispatcher`'s actual ingestion/dedup logic,
 * imported into `DomainEventsModule` the same way `recommendation-engine`'s
 * own `DomainEventsModule` imports `LearningPlanModule`/`notification-service`'s
 * own imports `NotificationModule` for their own real logic.
 */
@Module({
  providers: [AnalyticsEventDispatcher],
  exports: [AnalyticsEventDispatcher],
})
export class AnalyticsModule {}
