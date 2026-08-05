import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { MfaGuard } from './mfa.guard.js';

function makeContext(user: { role: string; userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('MfaGuard', () => {
  let servicePrisma: { user: { findUnique: jest.Mock } };
  let guard: MfaGuard;

  beforeEach(() => {
    servicePrisma = { user: { findUnique: jest.fn() } };
    guard = new MfaGuard(servicePrisma as unknown as PrismaClient);
  });

  it('allows a non-privileged (USER/TEACHER) caller through without even checking mfaEnrolled', async () => {
    const context = makeContext({ role: 'USER', userId: 'u-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(servicePrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows an ADMIN caller with mfaEnrolled=true', async () => {
    servicePrisma.user.findUnique.mockResolvedValue({ mfaEnrolled: true });
    const context = makeContext({ role: 'ADMIN', userId: 'u-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows an ENTERPRISE_ADMIN caller with mfaEnrolled=true', async () => {
    servicePrisma.user.findUnique.mockResolvedValue({ mfaEnrolled: true });
    const context = makeContext({ role: 'ENTERPRISE_ADMIN', userId: 'u-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks an ADMIN caller with mfaEnrolled=false', async () => {
    servicePrisma.user.findUnique.mockResolvedValue({ mfaEnrolled: false });
    const context = makeContext({ role: 'ADMIN', userId: 'u-1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed (blocks) when the user row no longer exists', async () => {
    servicePrisma.user.findUnique.mockResolvedValue(null);
    const context = makeContext({ role: 'ADMIN', userId: 'u-gone' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
