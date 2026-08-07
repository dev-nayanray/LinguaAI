import type { DomainEvent } from '@linguaai/events';

import type { LearningPlanService } from '../learning-plan/learning-plan.service.js';
import { DomainEventDispatcher } from './domain-event-dispatcher.service.js';

function fakeLearningPlanService(): jest.Mocked<
  Pick<LearningPlanService, 'handleAssessmentAttemptCompleted'>
> {
  return { handleAssessmentAttemptCompleted: jest.fn().mockResolvedValue(undefined) };
}

function fakeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'evt-1',
    type: 'assessment.attempt.completed',
    version: 1,
    occurredAt: '2026-08-07T00:00:00.000Z',
    producedBy: 'apps/api',
    tenantId: null,
    userId: '11111111-1111-4111-8111-111111111111',
    payload: {
      attemptId: '33333333-3333-4333-8333-333333333333',
      languageId: '22222222-2222-4222-8222-222222222222',
      type: 'PLACEMENT',
      skillResults: [{ skill: 'READING', cefrLevel: 'B1', confidence: 0.6, lowConfidence: false }],
    },
    ...overrides,
  };
}

describe('DomainEventDispatcher', () => {
  function buildDispatcher(learningPlanService: ReturnType<typeof fakeLearningPlanService>) {
    return new DomainEventDispatcher(learningPlanService as unknown as LearningPlanService);
  }

  it('delegates an assessment.attempt.completed event to LearningPlanService with the validated payload', async () => {
    const learningPlanService = fakeLearningPlanService();
    const dispatcher = buildDispatcher(learningPlanService);
    const event = fakeEvent();

    await dispatcher.dispatch('assessment.attempt.completed', event);

    expect(learningPlanService.handleAssessmentAttemptCompleted).toHaveBeenCalledWith(
      event.userId,
      event.payload,
    );
  });

  it('ignores an event type this consumer does not care about, without throwing', async () => {
    const learningPlanService = fakeLearningPlanService();
    const dispatcher = buildDispatcher(learningPlanService);

    await expect(
      dispatcher.dispatch(
        'identity.user.registered',
        fakeEvent({ type: 'identity.user.registered' }),
      ),
    ).resolves.toBeUndefined();
    expect(learningPlanService.handleAssessmentAttemptCompleted).not.toHaveBeenCalled();
  });

  it('skips an assessment.attempt.completed event with no userId, without throwing', async () => {
    const learningPlanService = fakeLearningPlanService();
    const dispatcher = buildDispatcher(learningPlanService);

    await expect(
      dispatcher.dispatch('assessment.attempt.completed', fakeEvent({ userId: null })),
    ).resolves.toBeUndefined();
    expect(learningPlanService.handleAssessmentAttemptCompleted).not.toHaveBeenCalled();
  });

  it('throws (never silently skips) when the payload fails schema validation', async () => {
    const learningPlanService = fakeLearningPlanService();
    const dispatcher = buildDispatcher(learningPlanService);
    const event = fakeEvent({ payload: { malformed: true } });

    await expect(dispatcher.dispatch('assessment.attempt.completed', event)).rejects.toThrow();
    expect(learningPlanService.handleAssessmentAttemptCompleted).not.toHaveBeenCalled();
  });
});
