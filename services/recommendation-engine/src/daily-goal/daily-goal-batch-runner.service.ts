import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { RECOMMENDATION_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import { DailyGoalService } from './daily-goal.service.js';

/**
 * The real batch logic behind `DailyGoalModule`'s own `Worker` callback —
 * pulled out of the `.module.ts` file deliberately (coverage-exempt,
 * matching `DomainEventsModule`/`DomainEventDispatcher`'s own T2
 * precedent). One plan failing to generate must never stop every other
 * user's own `DailyGoal` from being generated in the same nightly run —
 * each plan's own error is caught and logged, not allowed to propagate
 * and abort the batch.
 */
@Injectable()
export class DailyGoalBatchRunner {
  private readonly logger = new Logger(DailyGoalBatchRunner.name);

  constructor(
    @Inject(RECOMMENDATION_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly dailyGoalService: DailyGoalService,
  ) {}

  /** Returns the count of plans processed successfully vs. failed — real, observable batch-run evidence, not just a void promise. */
  async run(): Promise<{ succeeded: number; failed: number }> {
    const activePlans = await this.prisma.learningPlan.findMany({
      where: { isActive: true },
      select: { id: true, userId: true, languageId: true },
    });

    let succeeded = 0;
    let failed = 0;
    for (const plan of activePlans) {
      try {
        await this.dailyGoalService.generateForPlan(plan);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(
          `Failed to generate DailyGoal for LearningPlan ${plan.id} (user ${plan.userId}): ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`DailyGoal batch run complete: ${succeeded} succeeded, ${failed} failed`);
    return { succeeded, failed };
  }
}
