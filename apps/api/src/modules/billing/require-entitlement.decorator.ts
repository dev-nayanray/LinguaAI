import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ENTITLEMENT_KEY = 'requireEntitlement';

/**
 * `@RequireEntitlement('pronunciationLabAccess')` (E15 T2, design doc
 * §6.3) — read by `EntitlementGuard`. `key` is a `Plan.limits`/
 * `Entitlement.limits` JSON key (e.g. `pronunciationLabAccess`); the
 * caller's own resolved `Entitlement` must have that key set to `true`.
 * Mirrors `@Roles(...)`/`RolesGuard`'s own established decorator+guard
 * shape for a materially different axis (plan entitlement, not RBAC
 * role) — the same "own fragment per distinct concern" discipline
 * `packages/config`'s own env-schema fragments already established.
 */
export const RequireEntitlement = (key: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_ENTITLEMENT_KEY, key);
