import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { EntitlementGuard } from './entitlement.guard.js';
import type { BillingService } from './billing.service.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function fakeReflector(requiredKey: string | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(requiredKey) } as unknown as Reflector;
}

function fakeContext(user?: { userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('EntitlementGuard', () => {
  it('allows the request through when the route has no @RequireEntitlement decorator', async () => {
    const reflector = fakeReflector(undefined);
    const billing = { hasEntitlement: jest.fn() };
    const guard = new EntitlementGuard(reflector, billing as unknown as BillingService);

    const result = await guard.canActivate(fakeContext({ userId: USER_ID }));

    expect(result).toBe(true);
    expect(billing.hasEntitlement).not.toHaveBeenCalled();
  });

  it('allows the request through when the caller has the required entitlement', async () => {
    const reflector = fakeReflector('pronunciationLabAccess');
    const billing = { hasEntitlement: jest.fn().mockResolvedValue(true) };
    const guard = new EntitlementGuard(reflector, billing as unknown as BillingService);

    const result = await guard.canActivate(fakeContext({ userId: USER_ID }));

    expect(result).toBe(true);
    expect(billing.hasEntitlement).toHaveBeenCalledWith(USER_ID, 'pronunciationLabAccess');
  });

  it('rejects with 403 when the caller lacks the required entitlement', async () => {
    const reflector = fakeReflector('pronunciationLabAccess');
    const billing = { hasEntitlement: jest.fn().mockResolvedValue(false) };
    const guard = new EntitlementGuard(reflector, billing as unknown as BillingService);

    await expect(guard.canActivate(fakeContext({ userId: USER_ID }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects (defensively) when no authenticated user is present at all', async () => {
    const reflector = fakeReflector('pronunciationLabAccess');
    const billing = { hasEntitlement: jest.fn() };
    const guard = new EntitlementGuard(reflector, billing as unknown as BillingService);

    await expect(guard.canActivate(fakeContext(undefined))).rejects.toThrow(ForbiddenException);
    expect(billing.hasEntitlement).not.toHaveBeenCalled();
  });
});
