-- E2-T16 fix for a real bug in E2-T15's enforce_last_enterprise_admin()
-- trigger, found empirically while verifying set_org_role() end-to-end:
-- the function unconditionally `RETURN OLD;` — correct for a BEFORE
-- DELETE trigger (any non-null return lets the delete proceed), but for a
-- BEFORE UPDATE trigger, returning OLD instead of NEW silently discards
-- the update's new values entirely — Postgres writes whatever row the
-- trigger function returns, not what the UPDATE statement asked for. The
-- trigger's own invariant check was correct (it let the operation through
-- when a second ENTERPRISE_ADMIN existed) but the demotion itself never
-- actually took effect: set_org_role()'s `UPDATE "OrganizationMembership"
-- SET "orgRole" = ...` ran, raised no error, yet the row's orgRole stayed
-- unchanged. E2-T15's own test suite never caught this because its tests
-- only exercised the DELETE path (member removal), never an orgRole
-- UPDATE — the UPDATE branch was only added for Part 9's "DELETE/UPDATE"
-- defense-in-depth wording and never actually tested until now.

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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION enforce_last_enterprise_admin() OWNER TO governance_role;
