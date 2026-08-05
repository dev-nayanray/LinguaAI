import type { ExecutionContext } from '@nestjs/common';

import type { OAuthService, RequestWithOAuthLinking } from '../oauth.service.js';
import type { RequestUser } from '../strategies/jwt.strategy.js';
import {
  AppleCallbackGuard,
  AppleLinkStartGuard,
  AppleStartGuard,
  GoogleCallbackGuard,
  GoogleLinkStartGuard,
  GoogleStartGuard,
} from './oauth.guards.js';

interface PassportGuardBase {
  canActivate: (context: ExecutionContext) => Promise<boolean>;
}

/**
 * `GoogleCallbackGuard extends AuthGuard('google')` and overrides
 * `canActivate` to check state first, then calls `super.canActivate`
 * (`@nestjs/passport`'s own mixin, which performs the real provider
 * exchange). There's no real Google/Apple strategy registered in a plain
 * unit test, so `super.canActivate` must be stubbed for the "state passes,
 * delegates onward" case — this reaches one level up the prototype chain
 * (past the guard's own overridden `canActivate`) to spy on exactly that
 * inherited method, without needing a real Passport strategy.
 */
function superCanActivateOf(guard: object): PassportGuardBase {
  return Object.getPrototypeOf(Object.getPrototypeOf(guard) as object) as PassportGuardBase;
}

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('OAuth start guards', () => {
  it('GoogleStartGuard.getAuthenticateOptions issues a GOOGLE state', async () => {
    const oauthService = {
      createState: jest.fn().mockResolvedValue('raw-state-value'),
    } as unknown as OAuthService;
    const guard = new GoogleStartGuard(oauthService);

    await expect(guard.getAuthenticateOptions()).resolves.toEqual({ state: 'raw-state-value' });
    expect(oauthService.createState).toHaveBeenCalledWith('GOOGLE');
  });

  it('AppleStartGuard.getAuthenticateOptions issues an APPLE state', async () => {
    const oauthService = {
      createState: jest.fn().mockResolvedValue('raw-state-value'),
    } as unknown as OAuthService;
    const guard = new AppleStartGuard(oauthService);

    await expect(guard.getAuthenticateOptions()).resolves.toEqual({ state: 'raw-state-value' });
    expect(oauthService.createState).toHaveBeenCalledWith('APPLE');
  });
});

describe('OAuth link-start guards (E2-T12)', () => {
  it("GoogleLinkStartGuard tags the issued state with the caller's own userId (from a prior AuthGuard('jwt'))", async () => {
    const oauthService = {
      createState: jest.fn().mockResolvedValue('raw-state-value'),
    } as unknown as OAuthService;
    const guard = new GoogleLinkStartGuard(oauthService);
    const context = makeContext({ user: { userId: 'u-1' } as RequestUser });

    await expect(guard.getAuthenticateOptions(context)).resolves.toEqual({
      state: 'raw-state-value',
    });
    expect(oauthService.createState).toHaveBeenCalledWith('GOOGLE', 'u-1');
  });

  it("AppleLinkStartGuard tags the issued state with the caller's own userId", async () => {
    const oauthService = {
      createState: jest.fn().mockResolvedValue('raw-state-value'),
    } as unknown as OAuthService;
    const guard = new AppleLinkStartGuard(oauthService);
    const context = makeContext({ user: { userId: 'u-1' } as RequestUser });

    await expect(guard.getAuthenticateOptions(context)).resolves.toEqual({
      state: 'raw-state-value',
    });
    expect(oauthService.createState).toHaveBeenCalledWith('APPLE', 'u-1');
  });
});

describe('OAuth callback guards', () => {
  // AuthGuard('google')/AuthGuard('apple') return a class memoized per
  // strategy name — every `new GoogleCallbackGuard(...)` instance across
  // these tests shares the SAME parent prototype object, so a spy left on
  // it after one test leaks into the next (confirmed empirically: a spy's
  // call count carried over between `it` blocks without this).
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GoogleCallbackGuard consumes state from the query string, attaches linkingUserId to the request, before delegating to Passport', async () => {
    const oauthService = {
      consumeState: jest.fn().mockResolvedValue({ linkingUserId: null }),
    } as unknown as OAuthService;
    const guard = new GoogleCallbackGuard(oauthService);
    jest.spyOn(superCanActivateOf(guard), 'canActivate').mockResolvedValue(true);

    const context = makeContext({ query: { state: 'raw-state' } });
    const result = await guard.canActivate(context);

    expect(oauthService.consumeState).toHaveBeenCalledWith('GOOGLE', 'raw-state');
    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest<RequestWithOAuthLinking>();
    expect(req.oauthLinkingUserId).toBeNull();
  });

  it('GoogleCallbackGuard attaches a non-null linkingUserId when the state was issued by the linking flow (E2-T12)', async () => {
    const oauthService = {
      consumeState: jest.fn().mockResolvedValue({ linkingUserId: 'u-1' }),
    } as unknown as OAuthService;
    const guard = new GoogleCallbackGuard(oauthService);
    jest.spyOn(superCanActivateOf(guard), 'canActivate').mockResolvedValue(true);

    const context = makeContext({ query: { state: 'raw-state' } });
    await guard.canActivate(context);

    const req = context.switchToHttp().getRequest<RequestWithOAuthLinking>();
    expect(req.oauthLinkingUserId).toBe('u-1');
  });

  it('GoogleCallbackGuard propagates state-consumption failures without ever calling into Passport', async () => {
    const error = new Error('invalid state');
    const oauthService = {
      consumeState: jest.fn().mockRejectedValue(error),
    } as unknown as OAuthService;
    const guard = new GoogleCallbackGuard(oauthService);
    const superCanActivate = jest
      .spyOn(superCanActivateOf(guard), 'canActivate')
      .mockResolvedValue(true);

    const context = makeContext({ query: {} });

    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it("AppleCallbackGuard reads state from the form_post body when it's not in the query string", async () => {
    const oauthService = {
      consumeState: jest.fn().mockResolvedValue({ linkingUserId: null }),
    } as unknown as OAuthService;
    const guard = new AppleCallbackGuard(oauthService);
    jest.spyOn(superCanActivateOf(guard), 'canActivate').mockResolvedValue(true);

    const context = makeContext({ query: {}, body: { state: 'raw-state-from-body' } });
    await guard.canActivate(context);

    expect(oauthService.consumeState).toHaveBeenCalledWith('APPLE', 'raw-state-from-body');
  });
});
