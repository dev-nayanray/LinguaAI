-- E2-T4: RLS policy matrix for User/Organization/OrganizationMembership
-- (docs/epics/E2-identity-access-platform.md Part 9). Every CREATE POLICY
-- statement below is transcribed verbatim from Part 9 — do not edit the
-- policy logic here without updating the design doc first.

-- ============================================================================
-- Prerequisite: app_role must exist as a real, non-superuser, non-owning
-- Postgres role before RLS means anything. `linguaai` (the role every prior
-- migration has run as) is a genuine Postgres superuser with
-- rolbypassrls=true — it unconditionally bypasses RLS regardless of any
-- policy, including under FORCE ROW LEVEL SECURITY (Postgres semantics: a
-- superuser is exempt from RLS, full stop). Confirmed empirically before
-- writing this migration (SELECT rolsuper, rolbypassrls FROM pg_roles).
--
-- Local-dev pragmatic choice, not a claim about production: on a real,
-- managed database, role provisioning is typically an infra/DBA-level
-- bootstrap step (matching how docs/epics/E2-implementation-plan.md §12
-- already treats the SECURITY DEFINER function owner role), not baked into
-- an app migration. Idempotent creation here is intentional so this
-- migration is safe to replay into a fresh local/CI database.
--
-- IMPORTANT follow-up (not this task's scope, flagged for whoever wires
-- apps/api's real runtime Prisma client, T8+): the application's actual
-- runtime DATABASE_URL must connect AS app_role, not as the migration-owning
-- superuser — otherwise RLS provides zero real protection in the running
-- app, exactly as it currently provides none when tested via `linguaai`.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role WITH LOGIN PASSWORD 'app_role_dev_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE linguaai TO app_role;
GRANT USAGE ON SCHEMA public TO app_role;
-- Baseline CRUD on every table that exists so far (T2+T3). Narrowed to a
-- column allowlist on User/OrganizationMembership/RoleChangeRequest by
-- E2-T6; immutability-locked on AuditLog/EntitlementChangeLog by E2-T7 —
-- neither of those has run yet, so this grant is deliberately broad for now,
-- matching the migration-ordering safety rule in the implementation plan
-- (grant broadly, narrow later, never a window with neither path working).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;

-- ============================================================================
-- Organization (the tenant root)
-- ============================================================================
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;

-- READ: visible to members of that org, or a platform admin
CREATE POLICY org_read ON "Organization"
  USING (
    id = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- INSERT: platform admin only (MULTITENANCY.md §4 — admin-initiated provisioning, not self-serve at MVP)
CREATE POLICY org_insert ON "Organization"
  FOR INSERT WITH CHECK (current_setting('app.is_platform_admin', true)::boolean = true);

-- UPDATE: that org's ENTERPRISE_ADMIN, or a platform admin
CREATE POLICY org_update ON "Organization"
  FOR UPDATE USING (
    (id = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- DELETE: platform admin only. No endpoint exposes this in Part 6 (org deletion is
-- high-consequence and out of MVP scope) — the policy exists defensively so a future
-- endpoint can't accidentally inherit a permissive default.
CREATE POLICY org_delete ON "Organization"
  FOR DELETE USING (current_setting('app.is_platform_admin', true)::boolean = true);

-- ============================================================================
-- OrganizationMembership
-- ============================================================================
ALTER TABLE "OrganizationMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationMembership" FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_read ON "OrganizationMembership"
  USING (
    "organizationId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY membership_insert ON "OrganizationMembership"
  FOR INSERT WITH CHECK (
    ("organizationId" = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY membership_update ON "OrganizationMembership"
  FOR UPDATE USING (
    ("organizationId" = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY membership_delete ON "OrganizationMembership"
  FOR DELETE USING (
    ("organizationId" = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- ============================================================================
-- User — the table the first E2 architecture review found missing entirely
-- ============================================================================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

CREATE POLICY user_read ON "User"
  USING (
    id = current_setting('app.current_user_id', true)::uuid
    OR "organizationId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- INSERT: denied to the standard per-request role entirely (registration and OAuth
-- account creation happen pre-authentication, before any app.current_user_id exists
-- to check against) — handled by app_service_role (BYPASSRLS), created in E2-T5.
CREATE POLICY user_insert ON "User"
  FOR INSERT WITH CHECK (false);

CREATE POLICY user_update ON "User"
  FOR UPDATE USING (
    id = current_setting('app.current_user_id', true)::uuid
    OR (current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN'
        AND "organizationId" = current_setting('app.current_org_id', true)::uuid)
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- DELETE: denied to the standard role. GDPR erasure (DATABASE.md §10) anonymizes
-- User rows in place rather than deleting them, and runs through app_service_role.
CREATE POLICY user_delete ON "User"
  FOR DELETE USING (false);
