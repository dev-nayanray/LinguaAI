-- E2-T15: defense-in-depth for the "cannot leave an org with zero
-- ENTERPRISE_ADMIN members" invariant (Part 9: "The RLS policy alone
-- cannot express... a row-count invariant... backed by a CHECK-style
-- database trigger as defense-in-depth"). set_org_role() (E2-T5) already
-- guards the UPDATE (demotion) path with its own advisory-locked check;
-- this closes the DELETE (removal) path, which no existing function
-- covers, and — since triggers fire regardless of which role performs the
-- DML — also protects against a bug in organizations.service.ts's own
-- application-layer check, not just against a hypothetical direct write.
--
-- Uses the SAME advisory-lock key (namespace 44, hashtext(orgId)) as
-- set_org_role() deliberately — both protect the identical invariant, and
-- a concurrent demotion-via-PATCH racing a removal-via-DELETE for the same
-- org must serialize against each other, not just against same-kind calls.
-- Also fires on UPDATE OF "orgRole" (matching Part 9's "DELETE/UPDATE"
-- wording exactly) — redundant with set_org_role()'s own check on that
-- path, which is the point of defense-in-depth.
--
-- `governance_role` (E2-T5) is deliberately NOBYPASSRLS, so a SECURITY
-- DEFINER function it owns is itself subject to "OrganizationMembership"'s
-- `membership_read` RLS policy for its own internal queries — confirmed
-- empirically: with no `app.current_org_id`/`app.is_platform_admin`
-- session context (exactly the case for `organizations.service.ts`'s own
-- `app_service_role`-based membership deletes, since that connection is
-- never wrapped by `tenant-rls.extension.ts`'s context-setting — that
-- extension only wraps `APP_PRISMA_CLIENT`), the trigger's own count query
-- saw zero rows and blocked every deletion, not just genuinely-last-admin
-- ones. Fixed by having the trigger declare itself platform-admin-scoped
-- for the duration of its own internal integrity check (`is_local = true`,
-- so it only affects this single statement's transaction) — correct
-- regardless of the outer caller's tenant context, since this is a
-- system-level data-integrity check, not a caller-scoped authorization
-- decision; RLS's own `is_platform_admin` branch exists for exactly this
-- kind of cross-tenant necessity (Part 9: "visible, intentional, and
-- logged... rather than bypassing RLS entirely").

CREATE OR REPLACE FUNCTION enforce_last_enterprise_admin() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_remaining_admins int;
BEGIN
  IF OLD."orgRole" = 'ENTERPRISE_ADMIN' AND (TG_OP = 'DELETE' OR NEW."orgRole" <> 'ENTERPRISE_ADMIN') THEN
    PERFORM pg_advisory_xact_lock(44, hashtext(OLD."organizationId"::text));
    PERFORM set_config('app.is_platform_admin', 'true', true);

    SELECT count(*) INTO v_remaining_admins FROM "OrganizationMembership"
      WHERE "organizationId" = OLD."organizationId" AND "orgRole" = 'ENTERPRISE_ADMIN' AND id <> OLD.id;

    IF v_remaining_admins = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_enterprise_admin';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION enforce_last_enterprise_admin() OWNER TO governance_role;

CREATE TRIGGER enforce_last_enterprise_admin_trigger
  BEFORE DELETE OR UPDATE OF "orgRole" ON "OrganizationMembership"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_last_enterprise_admin();
