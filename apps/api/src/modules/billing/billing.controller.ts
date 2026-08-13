import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { BillingStatusResponse, CheckoutSessionResponse } from '@linguaai/validation/commerce';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { BillingService } from './billing.service.js';
import { StripeClientService } from './stripe-client.service.js';

interface JwtAuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * `/v1/billing/*` (E15 T1, design doc §5/§6). `webhooks/stripe` is
 * deliberately outside `AuthGuard('jwt')` (a server-to-server Stripe
 * callback, authenticated by signature verification instead, §6.2) and
 * needs the app's own `rawBody: true` option (main.ts/e2e test setup) so
 * `req.rawBody` is the exact byte sequence Stripe signed — a JSON-parsed-
 * then-re-serialized body would not reproduce the same signature.
 */
@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly stripeClient: StripeClientService,
  ) {}

  @Post('checkout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Creates a Stripe Checkout Session for the Free→Premium upgrade' })
  async createCheckoutSession(
    @Req() req: JwtAuthenticatedRequest,
  ): Promise<CheckoutSessionResponse> {
    return this.billing.createCheckoutSession(req.user.userId);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: "The caller's own current plan, subscription status, and entitlement" })
  async getStatus(@Req() req: JwtAuthenticatedRequest): Promise<BillingStatusResponse> {
    return this.billing.getStatus(req.user.userId);
  }

  @Post('webhooks/stripe')
  @ApiExcludeEndpoint()
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or request body');
    }

    let event;
    try {
      event = this.stripeClient.constructWebhookEvent(req.rawBody, signature);
    } catch {
      // A tampered or invalid signature is a real, security-relevant
      // rejection (§6.2) -- a 4xx, never an uncaught 500 that could mask
      // the real reason in a generic error page.
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    await this.billing.handleWebhookEvent(event);
    return { received: true };
  }
}
