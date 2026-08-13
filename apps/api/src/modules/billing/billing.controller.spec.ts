import { BadRequestException } from '@nestjs/common';
import type { BillingStatusResponse, CheckoutSessionResponse } from '@linguaai/validation/commerce';

import { BillingController } from './billing.controller.js';
import type { BillingService } from './billing.service.js';
import type { StripeClientService } from './stripe-client.service.js';

function buildReq() {
  return {
    user: { userId: 'user-1', role: 'LEARNER', organizationId: null, orgRole: null },
  };
}

describe('BillingController', () => {
  it("createCheckoutSession delegates to BillingService with the caller's own userId", async () => {
    const response: CheckoutSessionResponse = { checkoutUrl: 'https://checkout.stripe.com/abc' };
    const billing = { createCheckoutSession: jest.fn().mockResolvedValue(response) };
    const controller = new BillingController(
      billing as unknown as BillingService,
      {} as StripeClientService,
    );

    const result = await controller.createCheckoutSession(
      buildReq() as unknown as Parameters<typeof controller.createCheckoutSession>[0],
    );

    expect(billing.createCheckoutSession).toHaveBeenCalledWith('user-1');
    expect(result).toBe(response);
  });

  it("getStatus delegates to BillingService with the caller's own userId", async () => {
    const response: BillingStatusResponse = {
      planTier: 'FREE',
      subscriptionStatus: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      limits: {},
      usage: {},
    };
    const billing = { getStatus: jest.fn().mockResolvedValue(response) };
    const controller = new BillingController(
      billing as unknown as BillingService,
      {} as StripeClientService,
    );

    const result = await controller.getStatus(
      buildReq() as unknown as Parameters<typeof controller.getStatus>[0],
    );

    expect(billing.getStatus).toHaveBeenCalledWith('user-1');
    expect(result).toBe(response);
  });

  describe('handleStripeWebhook', () => {
    it('rejects a request with no rawBody or signature with 400', async () => {
      const billing = { handleWebhookEvent: jest.fn() };
      const stripeClient = { constructWebhookEvent: jest.fn() };
      const controller = new BillingController(
        billing as unknown as BillingService,
        stripeClient as unknown as StripeClientService,
      );

      await expect(
        controller.handleStripeWebhook({ rawBody: undefined } as never, undefined),
      ).rejects.toThrow(BadRequestException);
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('rejects an invalid/tampered signature with 400, never an uncaught 500', async () => {
      const billing = { handleWebhookEvent: jest.fn() };
      const stripeClient = {
        constructWebhookEvent: jest.fn().mockImplementation(() => {
          throw new Error('signature mismatch');
        }),
      };
      const controller = new BillingController(
        billing as unknown as BillingService,
        stripeClient as unknown as StripeClientService,
      );

      await expect(
        controller.handleStripeWebhook({ rawBody: Buffer.from('{}') } as never, 'bad-signature'),
      ).rejects.toThrow(BadRequestException);
      expect(billing.handleWebhookEvent).not.toHaveBeenCalled();
    });

    it('verifies the signature then delegates the constructed event to BillingService', async () => {
      const fakeEvent = { type: 'invoice.paid', data: { object: {} } };
      const billing = { handleWebhookEvent: jest.fn().mockResolvedValue(undefined) };
      const stripeClient = { constructWebhookEvent: jest.fn().mockReturnValue(fakeEvent) };
      const controller = new BillingController(
        billing as unknown as BillingService,
        stripeClient as unknown as StripeClientService,
      );
      const rawBody = Buffer.from('{"type":"invoice.paid"}');

      const result = await controller.handleStripeWebhook({ rawBody } as never, 'valid-signature');

      expect(stripeClient.constructWebhookEvent).toHaveBeenCalledWith(rawBody, 'valid-signature');
      expect(billing.handleWebhookEvent).toHaveBeenCalledWith(fakeEvent);
      expect(result).toEqual({ received: true });
    });
  });
});
