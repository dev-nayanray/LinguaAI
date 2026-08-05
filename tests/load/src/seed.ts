import { randomUUID } from 'node:crypto';

import { getPrismaClient } from '@linguaai/database';

/**
 * "Realistic multi-tenant data volumes, not an empty database" (E2-T27's
 * own acceptance text) — no number is specified anywhere in PERFORMANCE.md
 * or the implementation plan, so this is a flagged, reasonable choice, not
 * a derived one: 50 organizations × 20 members (1,000 users) — enough that
 * `WHERE "organizationId" = current_org_id` and RLS's `OR` branches are
 * actually selecting out of a real multi-tenant table rather than a
 * near-empty one, while still seeding in well under a minute against local
 * Postgres. Seeded directly via the migration-superuser client (`getPrismaClient`)
 * — this is test-fixture setup, not a claim about which role a real write
 * path would use, and skipping the app layer (Argon2id hashing,
 * `app_service_role`) is what keeps seeding fast at this volume.
 */
export const ORG_COUNT = 50;
export const MEMBERS_PER_ORG = 20;

export interface SeededData {
  orgIds: string[];
}

export async function seedMultiTenantData(): Promise<SeededData> {
  const prisma = getPrismaClient();
  const orgIds: string[] = [];

  for (let i = 0; i < ORG_COUNT; i += 1) {
    const org = await prisma.organization.create({
      data: { name: `Load Test Org ${i} ${randomUUID()}` },
    });
    orgIds.push(org.id);

    const users = Array.from({ length: MEMBERS_PER_ORG }, (_, j) => ({
      id: randomUUID(),
      email: `load-test-${org.id}-${j}@test.local`,
      displayName: `Load Test User ${j}`,
      locale: 'en-US',
      timezone: 'UTC',
      organizationId: org.id,
      status: 'ACTIVE' as const,
    }));
    await prisma.user.createMany({ data: users });

    // Index 0 is the org's ENTERPRISE_ADMIN — the realistic caller identity
    // for `GET /v1/organizations/:id` and membership-list reads, the two
    // RLS-protected paths this task's own Database-budget check measures.
    await prisma.organizationMembership.createMany({
      data: users.map((u, j) => ({
        userId: u.id,
        organizationId: org.id,
        orgRole: j === 0 ? ('ENTERPRISE_ADMIN' as const) : ('MEMBER' as const),
      })),
    });
  }

  return { orgIds };
}

export async function cleanupSeededData(orgIds: string[]): Promise<void> {
  const prisma = getPrismaClient();
  // Each seeded org has exactly one ENTERPRISE_ADMIN (index 0) — E2-T15's
  // last-admin-standing trigger correctly blocks removing them individually,
  // same as every other e2e suite's teardown here; disabling triggers for
  // this superuser cleanup session is the established way to tear down a
  // whole org at once (see e.g. role-lifecycle.e2e-spec.ts's afterAll).
  await prisma.$executeRawUnsafe('SET session_replication_role = replica');
  await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}
