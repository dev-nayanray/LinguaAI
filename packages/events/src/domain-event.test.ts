import { describe, expect, it, vi } from 'vitest';

import {
  createDomainEventsQueue,
  DomainEventPublisher,
  DOMAIN_EVENTS_QUEUE_NAME,
} from './domain-event.js';

describe('DomainEventPublisher', () => {
  it('publishes an envelope with the correct fixed shape (EVENT_ARCHITECTURE.md §2)', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as import('bullmq').Queue;
    const publisher = new DomainEventPublisher(queue);

    await publisher.publish('identity.user.registered', {
      userId: 'u-1',
      tenantId: 'org-1',
      payload: { signupSource: 'password' },
    });

    expect(add).toHaveBeenCalledTimes(1);
    const [jobName, envelope] = add.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobName).toBe('identity.user.registered');
    expect(envelope).toEqual(
      expect.objectContaining({
        eventId: expect.any(String),
        type: 'identity.user.registered',
        version: 1,
        occurredAt: expect.any(String),
        producedBy: 'apps/api',
        tenantId: 'org-1',
        userId: 'u-1',
        payload: { signupSource: 'password' },
      }),
    );
  });

  it('defaults tenantId to null when not provided', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as import('bullmq').Queue;
    const publisher = new DomainEventPublisher(queue);

    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });

    const [, envelope] = add.mock.calls[0] as [string, Record<string, unknown>];
    expect(envelope.tenantId).toBeNull();
  });

  it('generates a distinct eventId per publish call', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as import('bullmq').Queue;
    const publisher = new DomainEventPublisher(queue);

    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });
    await publisher.publish('identity.mfa.enrolled', { userId: 'u-1', payload: {} });

    const [, first] = add.mock.calls[0] as [string, { eventId: string }];
    const [, second] = add.mock.calls[1] as [string, { eventId: string }];
    expect(first.eventId).not.toBe(second.eventId);
  });
});

describe('createDomainEventsQueue', () => {
  it('constructs a BullMQ Queue named after DOMAIN_EVENTS_QUEUE_NAME, without connecting synchronously (ioredis connects lazily on first use)', async () => {
    const queue = createDomainEventsQueue('redis://localhost:6379');
    try {
      expect(queue.name).toBe(DOMAIN_EVENTS_QUEUE_NAME);
    } finally {
      await queue.close();
    }
  });
});
