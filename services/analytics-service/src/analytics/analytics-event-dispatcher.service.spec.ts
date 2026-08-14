import type { DomainEvent } from '@linguaai/events';

import { AnalyticsEventDispatcher } from './analytics-event-dispatcher.service.js';

function fakeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'evt-1',
    type: 'assessment.attempt.completed',
    version: 1,
    occurredAt: '2026-08-14T00:00:00.000Z',
    producedBy: 'apps/api',
    tenantId: null,
    userId: '11111111-1111-4111-8111-111111111111',
    payload: { attemptId: '33333333-3333-4333-8333-333333333333' },
    ...overrides,
  };
}

describe('AnalyticsEventDispatcher', () => {
  const findFirst = jest.fn();
  const create = jest.fn();
  const prisma = { learningEvent: { findFirst, create } };

  function buildDispatcher(): AnalyticsEventDispatcher {
    return new AnalyticsEventDispatcher(prisma as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a real, previously-unseen event as a LearningEvent row, regardless of type — generic ingestion, no jobName switch (design doc §3.2)', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({});
    const dispatcher = buildDispatcher();
    const event = fakeEvent({ type: 'community.content.reported' });

    await dispatcher.dispatch('community.content.reported', event);

    expect(findFirst).toHaveBeenCalledWith({
      where: { eventId: 'evt-1' },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        eventId: 'evt-1',
        type: 'community.content.reported',
        version: 1,
        occurredAt: new Date('2026-08-14T00:00:00.000Z'),
        producedBy: 'apps/api',
        userId: '11111111-1111-4111-8111-111111111111',
        payload: { attemptId: '33333333-3333-4333-8333-333333333333' },
      },
    });
  });

  it('preserves a null userId (an anonymized/system-originated event) rather than coercing it', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({});
    const dispatcher = buildDispatcher();
    const event = fakeEvent({ userId: null });

    await dispatcher.dispatch('assessment.attempt.completed', event);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: null }) }),
    );
  });

  it('is a real no-op (no insert) on a duplicate eventId — best-effort idempotency (design doc §3.1)', async () => {
    findFirst.mockResolvedValue({ id: 'row-1' });
    const dispatcher = buildDispatcher();

    await dispatcher.dispatch('assessment.attempt.completed', fakeEvent());

    expect(create).not.toHaveBeenCalled();
  });
});
