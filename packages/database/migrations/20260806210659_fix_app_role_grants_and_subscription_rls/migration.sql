-- E4 T11: two real, distinct findings closed in one migration.
--
-- ============================================================================
-- 1. Grant gap (found while designing T11's RLS-lint script, not by
-- inspection alone): E2's own RLS migration
-- (20260730111235_add_identity_rls_policies) granted app_role/
-- app_service_role privileges via `GRANT ... ON ALL TABLES IN SCHEMA
-- public` -- a one-time snapshot of the tables that existed at that
-- moment, not a standing rule. No later E2 migration added
-- `ALTER DEFAULT PRIVILEGES`, so every table T2-T10 created (~54 tables)
-- was left with ZERO privileges granted to app_role. Confirmed directly:
-- `SELECT * FROM information_schema.role_table_grants WHERE grantee =
-- 'app_role' AND table_name = 'VocabularyItem'` returned no rows, while
-- the same query for `User` correctly returned SELECT/INSERT/DELETE.
-- Since the real application is designed to connect as app_role (not the
-- migration-owning superuser), every one of E4's tables would have been
-- completely inaccessible to the running app. Fixed here two ways: (a) a
-- broad re-grant covering every table that exists right now, and (b)
-- `ALTER DEFAULT PRIVILEGES FOR ROLE linguaai` so every future migration
-- (T12+, every later epic) grants automatically -- closing the root
-- cause, not just today's ~54-table symptom.
--
-- No column-level narrowing (matching E2-T6's privileged-column
-- allowlist for User) is applied to any E4 table here -- that kind of
-- security-hardening pass is real follow-up work for whichever future
-- epic/Security Gate review addresses E4's own sensitive fields, out of
-- this migration's scope.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE linguaai IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES FOR ROLE linguaai IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_service_role;

-- ============================================================================
-- 2. Subscription.organizationId is genuine tenant-scoping, not the
-- redundant-denormalization pattern E4 §3.3 reasoned about for every
-- other table -- a Business-tier Subscription is owned by the
-- Organization itself (paying for seats), not routed through any single
-- User.organizationId. E4 §3.3's blanket "none of E4's new tables get
-- their own organizationId column or RLS policy" conclusion did not
-- anticipate this table; corrected by direct decision rather than
-- silently left as an exception. Policy shape transcribed from the same
-- pattern E2's own User table uses for a table with BOTH self-owned and
-- org-owned rows (20260730111235_add_identity_rls_policies) -- a row is
-- visible/mutable if it's the caller's own (userId match), the caller's
-- org's (organizationId match), or the caller is a platform admin.
--
-- INSERT/UPDATE/DELETE are all denied to app_role, matching User's own
-- precedent for billing/system-of-record data driven by an external
-- event source (Stripe webhooks) rather than a live user session -- all
-- subscription mutations run through app_service_role (BYPASSRLS),
-- consistent with how User's own privileged-write paths work.
-- ============================================================================
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;

CREATE POLICY subscription_read ON "Subscription"
  USING (
    "userId" = current_setting('app.current_user_id', true)::uuid
    OR "organizationId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY subscription_insert ON "Subscription"
  FOR INSERT WITH CHECK (false);

CREATE POLICY subscription_update ON "Subscription"
  FOR UPDATE USING (false);

CREATE POLICY subscription_delete ON "Subscription"
  FOR DELETE USING (false);
