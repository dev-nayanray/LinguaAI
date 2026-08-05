import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';
import type { Request } from 'express';

import { SERVICE_ROLE_PRISMA_CLIENT } from '../../../database/index.js';
import type { RequestUser } from '../strategies/jwt.strategy.js';

/**
 * "Blocks ADMIN/ENTERPRISE_ADMIN routes pre-MFA-verify" (Part 7's component
 * design). Self-contained: it checks the *caller's own* role against a
 * fresh `mfaEnrolled` read, rather than reading a `@Roles(...)` decorator —
 * `RolesGuard`/`@Roles()` don't exist until E2-T14, and the implementation
 * plan is explicit that both guards get wired onto the same protected
 * routes together, not this one built ahead of a contract that doesn't
 * exist yet ("do not skip a phase; do not guess a future task's design").
 * Once E2-T14 lands, this guard is attached via `@UseGuards(RolesGuard,
 * MfaGuard)` on each `ADMIN`/`ENTERPRISE_ADMIN`-only route — no route in
 * this codebase is gated that way yet, so this guard currently has no live
 * consumer, the same position `JwtStrategy` was in after E2-T9 until
 * E2-T10 gave it one.
 *
 * The `mfaEnrolled` read runs through `app_service_role` — same pre-session
 * justification as `AuthService.isTokenStale`: this guard runs immediately
 * after `JwtAuthGuard`, before `tenant.middleware.ts` (E2-T14) has set any
 * RLS session context.
 */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(@Inject(SERVICE_ROLE_PRISMA_CLIENT) private readonly servicePrisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user: RequestUser }>();
    if (req.user.role !== 'ADMIN' && req.user.role !== 'ENTERPRISE_ADMIN') {
      return true;
    }

    const user = await this.servicePrisma.user.findUnique({
      where: { id: req.user.userId },
      select: { mfaEnrolled: true },
    });
    if (!user?.mfaEnrolled) {
      throw new ForbiddenException('MFA enrollment required before accessing this resource');
    }
    return true;
  }
}
