import { SetMetadata } from '@nestjs/common';
import type { Role } from '@linguaai/database';

export const ROLES_KEY = 'roles';

/**
 * `@Roles(Role.ADMIN, Role.ENTERPRISE_ADMIN)` (Part 7 of the design doc,
 * verbatim) — read by `RolesGuard`. An implementation detail of an
 * already-accepted requirement (SECURITY.md §3: "enforced server-side on
 * every request"), not a new architecture decision.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
