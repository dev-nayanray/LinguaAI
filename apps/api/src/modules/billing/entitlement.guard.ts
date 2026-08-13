import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { BillingService } from './billing.service.js';
import { REQUIRE_ENTITLEMENT_KEY } from './require-entitlement.decorator.js';

/**
 * Reads `@RequireEntitlement(key)` against the caller's own resolved
 * `Entitlement.limits` (E15 T2, design doc §6.3, closes RISK_REGISTER's
 * own already-tracked entitlement-enforcement gap — R-99: before
 * this guard existed, nothing anywhere checked a caller's plan before
 * serving a Premium-gated feature). Calls `BillingService.hasEntitlement()`
 * — deliberately not `getStatus()` — a real, found gap: guards run
 * *before* `TenantContextInterceptor` in Nest's own pipeline, so an
 * `appPrisma`-backed read from inside a guard has no RLS tenant context
 * set yet (`getStatus()` is only RLS-safe when called from a controller,
 * after interceptors have run). `hasEntitlement()` uses the service-role
 * client instead, the same reasoning `handleWebhookEvent()` already uses.
 *
 * A route with no `@RequireEntitlement(...)` decorator is allowed through
 * unconditionally — opt-in per route/controller, the same
 * `@Roles(...)`/`RolesGuard` precedent. Must run after `AuthGuard('jwt')`
 * in `@UseGuards(...)` — reads `request.user`, does not itself authenticate.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredKey = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const userId = request.user?.userId;
    if (!userId) {
      // AuthGuard('jwt') should already have rejected an unauthenticated
      // caller before this guard runs -- defensive, not a real path.
      throw new ForbiddenException('Authentication required');
    }

    const entitled = await this.billing.hasEntitlement(userId, requiredKey);
    if (!entitled) {
      // GlobalExceptionFilter maps this to API_GUIDELINES.md §3's real
      // `FORBIDDEN` (403) error code -- the same envelope every other
      // authorization failure in this codebase already produces
      // (RolesGuard's own precedent), not a bespoke shape.
      throw new ForbiddenException('This feature requires a Premium subscription');
    }
    return true;
  }
}
