import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Role } from '@linguaai/database';

import type { RequestUser } from '../strategies/jwt.strategy.js';
import { RolesGuard } from './roles.guard.js';

function makeContext(user: RequestUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows any authenticated caller through when the route declares no @Roles(...)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = makeContext({
      userId: 'u-1',
      role: 'USER',
      organizationId: null,
      orgRole: null,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows any authenticated caller through when @Roles() was declared with zero roles', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = makeContext({
      userId: 'u-1',
      role: 'USER',
      organizationId: null,
      orgRole: null,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a caller whose role is in the required list', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'ENTERPRISE_ADMIN'] as Role[]);
    const context = makeContext({
      userId: 'u-1',
      role: 'ADMIN',
      organizationId: null,
      orgRole: null,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks a caller whose role is not in the required list', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'ENTERPRISE_ADMIN'] as Role[]);
    const context = makeContext({
      userId: 'u-1',
      role: 'USER',
      organizationId: null,
      orgRole: null,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('fails closed when the route requires roles but no request.user is present', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN'] as Role[]);
    const context = makeContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('reads decorator metadata from both the handler and the class (getAllAndOverride semantics — method-level overrides class-level)', () => {
    reflector.getAllAndOverride.mockReturnValue(['TEACHER'] as Role[]);
    const context = makeContext({
      userId: 'u-1',
      role: 'TEACHER',
      organizationId: null,
      orgRole: null,
    });

    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
