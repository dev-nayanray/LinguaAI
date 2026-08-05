-- E2-T17: Part 9B's own text — "AuditLog is readable via GET /v1/audit-log
-- (platform ADMIN, unscoped) and GET /v1/organizations/:id/audit-log (that
-- org's ENTERPRISE_ADMIN, scoped to tenantId) — both endpoints sit behind
-- the exact same RLS pattern already established in Part 9 (tenantId plays
-- the same role organizationId does elsewhere)" — never actually built:
-- E2-T4 gave RLS to User/Organization/OrganizationMembership only, E2-T7
-- only handled AuditLog's UPDATE/DELETE-revoked immutability grants, and
-- neither covered read-scoping. This closes that gap.
--
-- INSERT is intentionally `WITH CHECK (true)` — a permissive catch-all,
-- not a per-row invariant like the read policy. Once RLS is enabled on a
-- table, every command defaults to fully denied unless a matching policy
-- exists, so *some* INSERT policy is required or every existing AuditLog
-- write (the three SECURITY DEFINER governance functions, E2-T5;
-- organizations.service.ts, E2-T15) breaks outright. Nothing in Part 9B
-- describes a per-row INSERT restriction (unlike Organization's
-- `org_insert`, which enforces "platform admin only" because self-serve
-- org creation is explicitly out of scope) — AuditLog rows are only ever
-- constructed by trusted, server-controlled code paths (no client-facing
-- "create an audit entry" endpoint exists or is planned), so table-level
-- GRANT (E2-T7) is the correct and sufficient control for writes; RLS's
-- job here is read-scoping only.

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_read ON "AuditLog"
  FOR SELECT USING (
    "tenantId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY audit_insert ON "AuditLog"
  FOR INSERT WITH CHECK (true);
