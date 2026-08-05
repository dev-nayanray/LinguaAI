import { getTenantContext, runWithTenantContext, type TenantContext } from './tenant-context.js';

describe('tenant-context (AsyncLocalStorage store)', () => {
  it('returns undefined outside any runWithTenantContext call', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('makes the context visible to getTenantContext() for the duration of the callback, including across an await', async () => {
    const context: TenantContext = {
      userId: 'u-1',
      organizationId: 'org-1',
      callerOrgRole: 'MEMBER',
      isPlatformAdmin: false,
    };

    await runWithTenantContext(context, async () => {
      expect(getTenantContext()).toEqual(context);
      await Promise.resolve();
      expect(getTenantContext()).toEqual(context);
    });

    expect(getTenantContext()).toBeUndefined();
  });

  it('keeps concurrent contexts isolated from each other (no cross-request leakage)', async () => {
    const contextA: TenantContext = {
      userId: 'u-a',
      organizationId: 'org-a',
      callerOrgRole: null,
      isPlatformAdmin: false,
    };
    const contextB: TenantContext = {
      userId: 'u-b',
      organizationId: null,
      callerOrgRole: null,
      isPlatformAdmin: true,
    };

    const seenA: (TenantContext | undefined)[] = [];
    const seenB: (TenantContext | undefined)[] = [];

    await Promise.all([
      runWithTenantContext(contextA, async () => {
        seenA.push(getTenantContext());
        await new Promise((resolve) => setTimeout(resolve, 5));
        seenA.push(getTenantContext());
      }),
      runWithTenantContext(contextB, async () => {
        seenB.push(getTenantContext());
        await new Promise((resolve) => setTimeout(resolve, 1));
        seenB.push(getTenantContext());
      }),
    ]);

    expect(seenA).toEqual([contextA, contextA]);
    expect(seenB).toEqual([contextB, contextB]);
  });
});
