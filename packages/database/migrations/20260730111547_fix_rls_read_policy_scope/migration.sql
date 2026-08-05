-- E2-T4 remediation: org_read / membership_read / user_read were created
-- (in the prior migration, transcribed verbatim from
-- docs/epics/E2-identity-access-platform.md Part 9) without a `FOR SELECT`
-- clause. Postgres applies a policy with no FOR clause to every command,
-- and OR's all applicable PERMISSIVE policies together for a given
-- command — so each _read policy's broader "same org" condition was also
-- being applied to UPDATE/DELETE, silently widening write access beyond
-- what the paired _update/_delete policies (and the design's own prose,
-- "READ: visible to...") intended.
--
-- Confirmed empirically before this fix: a plain OrganizationMembership
-- MEMBER (not ENTERPRISE_ADMIN) could UPDATE a fellow same-org User's row,
-- directly contradicting user_update's explicit ENTERPRISE_ADMIN
-- requirement. This migration scopes all three _read policies to SELECT
-- only, closing the gap. The design doc (Part 9) has the same omission in
-- its own SQL and needs the identical correction — flagged separately, not
-- silently fixed only here.

DROP POLICY org_read ON "Organization";
CREATE POLICY org_read ON "Organization"
  FOR SELECT USING (
    id = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

DROP POLICY membership_read ON "OrganizationMembership";
CREATE POLICY membership_read ON "OrganizationMembership"
  FOR SELECT USING (
    "organizationId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

DROP POLICY user_read ON "User";
CREATE POLICY user_read ON "User"
  FOR SELECT USING (
    id = current_setting('app.current_user_id', true)::uuid
    OR "organizationId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );
