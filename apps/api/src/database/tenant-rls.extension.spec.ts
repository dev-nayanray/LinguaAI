import type { PrismaClient } from '@linguaai/database';

import { runWithTenantContext } from './tenant-context.js';
import type { TenantContext } from './tenant-context.js';
import { buildSetSessionVarsSql, tenantRlsExtension } from './tenant-rls.extension.js';

describe('buildSetSessionVarsSql', () => {
  it('always includes all four session variables, in one statement', () => {
    const ctx: TenantContext = {
      userId: 'u-1',
      organizationId: null,
      callerOrgRole: null,
      isPlatformAdmin: false,
    };
    const sql = buildSetSessionVarsSql(ctx);

    expect(sql.sql).toContain("set_config('app.current_user_id'");
    expect(sql.sql).toContain("set_config('app.is_platform_admin'");
    expect(sql.sql).toContain("set_config('app.current_org_id'");
    expect(sql.sql).toContain("set_config('app.caller_org_role'");
  });

  it("never passes a bare null as a set_config value — a null organizationId/callerOrgRole gets a never-matching sentinel instead (verified: set_config coerces a NULL value to '', breaking every ::uuid cast; and relying on an omitted call reverting to real NULL was found unsafe under connection-pool reuse)", () => {
    const ctx: TenantContext = {
      userId: 'u-1',
      organizationId: null,
      callerOrgRole: null,
      isPlatformAdmin: false,
    };
    const sql = buildSetSessionVarsSql(ctx);

    expect(sql.values).not.toContain(null);
    expect(sql.values).toEqual([
      'u-1',
      'false',
      '00000000-0000-0000-0000-000000000000',
      '__none__',
    ]);
  });

  it('uses the real organizationId/callerOrgRole when the caller belongs to an organization', () => {
    const ctx: TenantContext = {
      userId: 'u-1',
      organizationId: 'org-1',
      callerOrgRole: 'MEMBER',
      isPlatformAdmin: false,
    };
    const sql = buildSetSessionVarsSql(ctx);

    expect(sql.values).toEqual(['u-1', 'false', 'org-1', 'MEMBER']);
  });

  it('serializes isPlatformAdmin as the literal text "true"/"false", never a JS boolean, for a clean ::boolean cast', () => {
    const admin = buildSetSessionVarsSql({
      userId: 'u-1',
      organizationId: null,
      callerOrgRole: null,
      isPlatformAdmin: true,
    });
    expect(admin.values).toContain('true');
    expect(admin.values).not.toContain(true);
  });

  it("the org-id sentinel is a syntactically valid uuid literal (won't itself break a ::uuid cast)", () => {
    const sql = buildSetSessionVarsSql({
      userId: 'u-1',
      organizationId: null,
      callerOrgRole: null,
      isPlatformAdmin: false,
    });
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(sql.values[2]).toMatch(uuidLike);
  });
});

describe('tenantRlsExtension query.$allOperations wiring', () => {
  // The extension's $allOperations hook batches `[set_config call, query(args)]`
  // into one `client.$transaction([...])` — proven correct against real
  // Postgres via a throwaway spike script (deleted after use, same
  // discipline as T13's SET LOCAL check). This test exercises the hook's
  // own control flow (context-present vs. context-absent) against a
  // minimal fake client, without needing a real database connection.
  it('passes the operation through unmodified when no tenant context is present', async () => {
    const query = jest.fn().mockResolvedValue('the-result');
    const transaction = jest.fn();
    const executeRaw = jest.fn();

    const fakeClient = {
      $transaction: transaction,
      $executeRaw: executeRaw,
      $extends({ query: queryComponent }: { query: { $allOperations: (p: unknown) => unknown } }) {
        return { $allOperations: queryComponent.$allOperations };
      },
    };

    const extended = tenantRlsExtension(fakeClient as unknown as PrismaClient) as unknown as {
      $allOperations: (p: { args: unknown; query: typeof query }) => Promise<unknown>;
    };

    const result = await extended.$allOperations({ args: { where: { id: 1 } }, query });

    expect(result).toBe('the-result');
    expect(query).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('batches a set_config call ahead of the operation, inside one $transaction, when tenant context is present', async () => {
    const query = jest.fn().mockReturnValue('deferred-op');
    const executeRaw = jest.fn().mockReturnValue('deferred-set-config');
    const transaction = jest.fn().mockResolvedValue(['set-config-result', 'the-result']);

    const fakeClient = {
      $transaction: transaction,
      $executeRaw: executeRaw,
      $extends({ query: queryComponent }: { query: { $allOperations: (p: unknown) => unknown } }) {
        return { $allOperations: queryComponent.$allOperations };
      },
    };

    const extended = tenantRlsExtension(fakeClient as unknown as PrismaClient) as unknown as {
      $allOperations: (p: { args: unknown; query: typeof query }) => Promise<unknown>;
    };

    const ctx = {
      userId: 'u-1',
      organizationId: 'org-1',
      callerOrgRole: 'MEMBER',
      isPlatformAdmin: false,
    };
    const result = await runWithTenantContext(ctx, () =>
      extended.$allOperations({ args: { x: 1 }, query }),
    );

    expect(result).toBe('the-result');
    expect(transaction).toHaveBeenCalledWith(['deferred-set-config', 'deferred-op']);
  });
});
