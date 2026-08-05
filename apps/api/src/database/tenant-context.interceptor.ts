import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import type { RequestUser } from '../modules/auth/strategies/jwt.strategy.js';
import { runWithTenantContext, type TenantContext } from './tenant-context.js';

/**
 * The design doc's `tenant.middleware.ts` (Part 7's component tree), in
 * practice: Part 9's own text says it "runs after auth resolves the
 * caller's identity" — which rules out real NestJS/Express HTTP middleware,
 * since middleware always runs *before* guards in Nest's request pipeline
 * (middleware → guards → interceptors → pipes → handler), and it's the
 * guard phase (`AuthGuard('jwt')` → `JwtStrategy.validate()`) that
 * populates `request.user`. An interceptor is the first pipeline stage
 * that runs after guards, so this is an interceptor, not middleware — Part
 * 9's own next sentence confirms the real mechanism is "Prisma middleware"
 * (`tenant-rls.extension.ts`'s Prisma Client Extension), not an HTTP layer
 * at all; this class is only the thin bridge from `request.user` (already
 * guard-verified) into the `AsyncLocalStorage` context that extension
 * reads.
 *
 * Registered globally (`APP_INTERCEPTOR`, `app.module.ts`) so it runs on
 * every request — routes with no auth guard simply have no `request.user`,
 * and this no-ops for them (no tenant context, `tenant-rls.extension.ts`
 * passes queries through unmodified, RLS fails closed for any
 * RLS-governed table a public route unexpectedly touches through
 * `app_role`).
 *
 * `isPlatformAdmin` is derived from `request.user.role`, not read
 * separately — Part 9's "verified server-side from the JWT claim, never
 * client-supplied" requirement is already satisfied one layer down:
 * `role` reached `request.user` only via `JwtStrategy.validate()`, which
 * runs after passport-jwt's own signature check and `AuthService.isTokenStale`'s
 * fresh staleness check — nothing here trusts anything not already verified.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    // Passport sets `request.user` for *every* strategy that succeeds, not
    // only `AuthGuard('jwt')` — `AuthGuard('local')` (the login route) also
    // populates it, with `LocalStrategy.validate()`'s `PublicUser` return
    // value (`id`, not `userId`). Trusting any truthy `request.user` here
    // fed that mismatched shape into `AuthService.issueSession`'s
    // `appPrisma.session.create`/`refreshToken.create` calls during login
    // (`userId: undefined`, since `PublicUser` has no `userId` field) —
    // confirmed via a throwaway debug trace to be the cause of a real
    // `invalid input syntax for type uuid` failure on later requests
    // reusing the same pooled connection. `userId` is `RequestUser`'s one
    // field `PublicUser` never has, so it's the correct discriminant.
    if (!user || typeof user.userId !== 'string') {
      return next.handle();
    }

    const tenantContext: TenantContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      callerOrgRole: user.orgRole,
      isPlatformAdmin: user.role === 'ADMIN',
    };

    return new Observable((subscriber) => {
      runWithTenantContext(tenantContext, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
