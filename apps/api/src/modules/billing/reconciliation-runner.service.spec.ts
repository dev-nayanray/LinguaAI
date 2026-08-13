import { ReconciliationRunner } from './reconciliation-runner.service.js';
import type { BillingService } from './billing.service.js';
import type { StripeClientService } from './stripe-client.service.js';

function fakeLogger() {
  return { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

describe('ReconciliationRunner', () => {
  it('reconciles every listed subscription against Postgres', async () => {
    const subscriptions = [{ id: 'sub_1' }, { id: 'sub_2' }, { id: 'sub_3' }];
    const stripeClient = { listRecentSubscriptions: jest.fn().mockResolvedValue(subscriptions) };
    const billing = { reconcileSubscription: jest.fn().mockResolvedValue(undefined) };
    const runner = new ReconciliationRunner(
      stripeClient as unknown as StripeClientService,
      billing as unknown as BillingService,
      fakeLogger() as never,
    );

    await runner.run();

    expect(billing.reconcileSubscription).toHaveBeenCalledTimes(3);
    for (const sub of subscriptions) {
      expect(billing.reconcileSubscription).toHaveBeenCalledWith(sub);
    }
  });

  it('one subscription failing to reconcile never aborts the rest of the batch', async () => {
    const subscriptions = [{ id: 'sub_1' }, { id: 'sub_2' }, { id: 'sub_3' }];
    const stripeClient = { listRecentSubscriptions: jest.fn().mockResolvedValue(subscriptions) };
    const billing = {
      reconcileSubscription: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('unrecognized Price id'))
        .mockResolvedValueOnce(undefined),
    };
    const logger = fakeLogger();
    const runner = new ReconciliationRunner(
      stripeClient as unknown as StripeClientService,
      billing as unknown as BillingService,
      logger as never,
    );

    await expect(runner.run()).resolves.toBeUndefined();

    expect(billing.reconcileSubscription).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: 'sub_2' }),
      expect.stringContaining('reconciliation failed'),
    );
  });

  it('a real, empty subscription list is a real no-op, not an error', async () => {
    const stripeClient = { listRecentSubscriptions: jest.fn().mockResolvedValue([]) };
    const billing = { reconcileSubscription: jest.fn() };
    const runner = new ReconciliationRunner(
      stripeClient as unknown as StripeClientService,
      billing as unknown as BillingService,
      fakeLogger() as never,
    );

    await expect(runner.run()).resolves.toBeUndefined();
    expect(billing.reconcileSubscription).not.toHaveBeenCalled();
  });
});
