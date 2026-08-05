import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';

import type { RequestUser } from '../modules/auth/strategies/jwt.strategy.js';
import { getTenantContext } from './tenant-context.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

function makeContext(user: RequestUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('TenantContextInterceptor', () => {
  let interceptor: TenantContextInterceptor;

  beforeEach(() => {
    interceptor = new TenantContextInterceptor();
  });

  it('passes the request through with no tenant context when request.user is absent (public/unauthenticated routes)', async () => {
    let observedDuringHandler: unknown;
    const handler: CallHandler = {
      handle: () => {
        observedDuringHandler = getTenantContext();
        return of('ok');
      },
    };

    const result = await firstValueFrom(interceptor.intercept(makeContext(undefined), handler));

    expect(result).toBe('ok');
    expect(observedDuringHandler).toBeUndefined();
  });

  it('populates userId/organizationId/callerOrgRole from request.user, visible for the duration of the downstream handler', async () => {
    const user: RequestUser = {
      userId: 'u-1',
      role: 'USER',
      organizationId: 'org-1',
      orgRole: 'MEMBER',
    };
    let observedDuringHandler: unknown;
    const handler: CallHandler = {
      handle: () => {
        observedDuringHandler = getTenantContext();
        return of('ok');
      },
    };

    await firstValueFrom(interceptor.intercept(makeContext(user), handler));

    expect(observedDuringHandler).toEqual({
      userId: 'u-1',
      organizationId: 'org-1',
      callerOrgRole: 'MEMBER',
      isPlatformAdmin: false,
    });
  });

  it("derives isPlatformAdmin true only for role === 'ADMIN' — never client-supplied, only from the already-verified JWT claim", async () => {
    const adminUser: RequestUser = {
      userId: 'u-2',
      role: 'ADMIN',
      organizationId: null,
      orgRole: null,
    };
    let observed: unknown;
    const handler: CallHandler = {
      handle: () => {
        observed = getTenantContext();
        return of('ok');
      },
    };

    await firstValueFrom(interceptor.intercept(makeContext(adminUser), handler));

    expect((observed as { isPlatformAdmin: boolean }).isPlatformAdmin).toBe(true);
  });

  it("does not treat ENTERPRISE_ADMIN (an org-level role) as isPlatformAdmin — that is User.role === 'ADMIN' only (Part 9)", async () => {
    const enterpriseAdmin: RequestUser = {
      userId: 'u-3',
      role: 'ENTERPRISE_ADMIN',
      organizationId: 'org-1',
      orgRole: 'ENTERPRISE_ADMIN',
    };
    let observed: unknown;
    const handler: CallHandler = {
      handle: () => {
        observed = getTenantContext();
        return of('ok');
      },
    };

    await firstValueFrom(interceptor.intercept(makeContext(enterpriseAdmin), handler));

    expect((observed as { isPlatformAdmin: boolean }).isPlatformAdmin).toBe(false);
  });

  it("does not populate tenant context from AuthGuard('local')'s PublicUser (id/email/displayName — no userId field) — a real bug this suite caught: request.user is set by every successful Passport strategy, not only AuthGuard('jwt'), and the login route's own PublicUser was being fed in as if it were RequestUser (userId: undefined), corrupting later requests that reused the same pooled DB connection", async () => {
    const loginRoutePublicUser = {
      id: 'u-1',
      email: 'user@test.local',
      displayName: 'Test User',
      role: 'USER',
    };
    let observedDuringHandler: unknown;
    const handler: CallHandler = {
      handle: () => {
        observedDuringHandler = getTenantContext();
        return of('ok');
      },
    };

    await firstValueFrom(
      interceptor.intercept(makeContext(loginRoutePublicUser as unknown as RequestUser), handler),
    );

    expect(observedDuringHandler).toBeUndefined();
  });

  it('leaves no tenant context visible once the handler observable completes', async () => {
    const user: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };
    const handler: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(makeContext(user), handler));

    expect(getTenantContext()).toBeUndefined();
  });
});
