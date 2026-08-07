import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '@linguaai/events';
import { assessmentAttemptCompletedPayloadSchema } from '@linguaai/validation/learning';

import { LearningPlanService } from '../learning-plan/learning-plan.service.js';

/**
 * The real dispatch logic behind `DomainEventsModule`'s own `Worker`
 * callback — pulled out of the `.module.ts` file deliberately, since
 * `*.module.ts` files are exempt from this repo's coverage requirement
 * (`jest.config.js`'s own `collectCoverageFrom`, matching
 * `PartitionMaintenanceModule`'s own zero-test precedent for pure wiring)
 * and this class's own filtering/validation logic is real behavior, not
 * wiring, and deserves real test coverage.
 */
@Injectable()
export class DomainEventDispatcher {
  private readonly logger = new Logger(DomainEventDispatcher.name);

  constructor(private readonly learningPlanService: LearningPlanService) {}

  /**
   * `jobName` is the same string as the event's own `type`
   * (`DomainEventPublisher.publish()` calls `queue.add(type, envelope)`).
   * Every event type this consumer doesn't yet care about (everything but
   * `assessment.attempt.completed` today; T3/T4 add more) is a real
   * no-op, not a missing case — this consumer's own `Worker` sees every
   * event on the shared `domain-events` queue regardless of relevance,
   * by that queue's own current single-queue design (`DomainEventsModule`'s
   * own doc comment has the full architectural gap this creates).
   */
  async dispatch(jobName: string, event: DomainEvent): Promise<void> {
    if (jobName !== 'assessment.attempt.completed') {
      return;
    }

    if (!event.userId) {
      this.logger.warn(
        `assessment.attempt.completed event ${event.eventId} has no userId — skipping`,
      );
      return;
    }

    // A malformed payload is a real, thrown error (Zod's own `.parse()`),
    // never silently skipped — the same "reproducible" discipline
    // `AssessmentScoringService.parseAndValidate` already established;
    // BullMQ's own failure handling takes over from there.
    const payload = assessmentAttemptCompletedPayloadSchema.parse(event.payload);
    await this.learningPlanService.handleAssessmentAttemptCompleted(event.userId, payload);
  }
}
