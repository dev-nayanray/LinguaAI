import { describe, expect, it, vi } from 'vitest';

import {
  createDomainEventsConsumerQueue,
  createDomainEventsQueues,
  domainEventsQueueName,
  DomainEventPublisher,
  DOMAIN_EVENT_CONSUMERS,
} from './domain-event.js';

function fakeQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) } as unknown as import('bullmq').Queue;
}

describe('DomainEventPublisher', () => {
  it('fans an envelope out to every registered consumer queue (E16 T1, closes RISK_REGISTER R-89)', async () => {
    const queueA = fakeQueue();
    const queueB = fakeQueue();
    const publisher = new DomainEventPublisher([queueA, queueB]);

    await publisher.publish('identity.user.registered', {
      userId: 'u-1',
      tenantId: 'org-1',
      payload: { signupSource: 'password' },
    });

    expect(queueA.add).toHaveBeenCalledTimes(1);
    expect(queueB.add).toHaveBeenCalledTimes(1);
    const [jobNameA, envelopeA] = (queueA.add as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    const [jobNameB, envelopeB] = (queueB.add as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(jobNameA).toBe('identity.user.registered');
    expect(jobNameB).toBe('identity.user.registered');
    // The exact same envelope (including eventId) reaches every consumer
    // -- a real fan-out, not two independently-generated events.
    expect(envelopeA).toEqual(envelopeB);
    expect(envelopeA).toEqual(
      expect.objectContaining({
        eventId: expect.any(String) as string,
        type: 'identity.user.registered',
        version: 1,
        occurredAt: expect.any(String) as string,
        producedBy: 'apps/api',
        tenantId: 'org-1',
        userId: 'u-1',
        payload: { signupSource: 'password' },
      }),
    );
  });

  it('accepts a single Queue too, not only an array (backward-compatible single-consumer call sites)', async () => {
    const queue = fakeQueue();
    const publisher = new DomainEventPublisher(queue);

    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('sets a real attempts/backoff retry policy on every fan-out add() call (closes R-89 own second sub-gap)', async () => {
    const queueA = fakeQueue();
    const queueB = fakeQueue();
    const publisher = new DomainEventPublisher([queueA, queueB]);

    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });

    for (const queue of [queueA, queueB]) {
      const [, , options] = (queue.add as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        unknown,
        { attempts: number; backoff: { type: string; delay: number } },
      ];
      expect(options).toEqual({ attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    }
  });

  it('defaults tenantId to null when not provided', async () => {
    const queue = fakeQueue();
    const publisher = new DomainEventPublisher(queue);

    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });

    const [, envelope] = (queue.add as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(envelope.tenantId).toBeNull();
  });

  it('generates a distinct eventId per publish call', async () => {
    const queue = fakeQueue();
    const publisher = new DomainEventPublisher(queue);

    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });
    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });

    const add = queue.add as ReturnType<typeof vi.fn>;
    const [, first] = add.mock.calls[0] as [string, { eventId: string }];
    const [, second] = add.mock.calls[1] as [string, { eventId: string }];
    expect(first.eventId).not.toBe(second.eventId);
  });

  it('stamps envelopes with a non-default producedBy when the constructor is given one (E7 T4 — recommendation-engine is the first real non-apps/api producer)', async () => {
    const queue = fakeQueue();
    const publisher = new DomainEventPublisher(queue, 'services/recommendation-engine');

    await publisher.publish('recommendation.daily_goal.ready', { userId: 'u-1', payload: {} });

    const [, envelope] = (queue.add as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { producedBy: string },
    ];
    expect(envelope.producedBy).toBe('services/recommendation-engine');
  });
});

describe('createDomainEventsQueues', () => {
  it('constructs one real, distinctly-named Queue per registered consumer (E16 T1)', async () => {
    const queues = createDomainEventsQueues('redis://localhost:6379');
    try {
      expect(Object.keys(queues).sort()).toEqual([...DOMAIN_EVENT_CONSUMERS].sort());
      for (const consumer of DOMAIN_EVENT_CONSUMERS) {
        expect(queues[consumer].name).toBe(domainEventsQueueName(consumer));
      }
    } finally {
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
    }
  });
});

describe('createDomainEventsConsumerQueue', () => {
  it("constructs a single named consumer's own real queue, without connecting synchronously (ioredis connects lazily on first use)", async () => {
    const queue = createDomainEventsConsumerQueue('redis://localhost:6379', 'notification-service');
    try {
      expect(queue.name).toBe('domain-events-notification-service');
    } finally {
      await queue.close();
    }
  });
});
