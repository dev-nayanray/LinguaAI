import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@linguaai/database';

import type { RequestUser } from '../strategies/jwt.strategy.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Reads the `@Roles(...)` decorator against the caller's JWT `role` claim
 * (already staleness-checked by `JwtStrategy.validate()`, which runs first
 * — every route this guards must also carry `AuthGuard('jwt')`, ordered
 * before this guard in `@UseGuards(...)`). Part 9's own text is explicit:
 * "RBAC and RLS remain independent … `RolesGuard` (role check) and
 * `tenant.middleware.ts` (tenant scope) are two separate, composable
 * NestJS request-pipeline stages, never conflated into one check" — this
 * guard does not touch tenant/org scope at all, only the caller's global
 * platform role.
 *
 * A route with no `@Roles(...)` decorator is allowed through (no
 * restriction declared) — `@Roles()` is opt-in per route/controller, not a
 * default-deny gate; `AuthGuard('jwt')` is what makes a route
 * authentication-required in the first place.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user || !requiredRoles.includes(user.role as Role)) {
      throw new ForbiddenException('Caller does not have the required role for this route');
    }
    return true;
  }
}
