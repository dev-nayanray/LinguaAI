-- E2-T5 remediation: AuditLog.id has no Postgres-level DEFAULT. Prisma's
-- `@default(uuid())` (schema.prisma) generates the UUID client-side, in
-- application code, before the INSERT is sent — it does not translate to a
-- SQL-level `DEFAULT` clause on the column. The three governance functions
-- write to AuditLog via raw SQL (never through Prisma's client), so they
-- must supply `id` explicitly. Confirmed empirically: the original
-- functions' INSERT statements omitted it, and testing the legitimate
-- success path failed with a NOT NULL violation on "id" — a real bug, not
-- present in prior text-only reviews since none executed the functions
-- against a real schema. Fixed here by generating the id inline via
-- gen_random_uuid() (a Postgres 13+ builtin, no extension needed).
--
-- Broader note, not fixed here (out of this task's scope — would touch
-- every @id column across the schema, not just these three functions):
-- any FUTURE raw-SQL write path to any table with an `@default(uuid())`
-- id column hits this identical gap unless it also supplies the id
-- explicitly. A schema-wide fix (Postgres-level `DEFAULT gen_random_uuid()`
-- on every id column) is a reasonable follow-up for whoever next needs a
-- raw-SQL write path, not solved here to avoid re-touching T2/T3's already
-- -verified migrations for a problem this task doesn't itself require
-- fixing everywhere.

CREATE OR REPLACE FUNCTION approve_role_change(
  p_request_id uuid,
  p_approver_id uuid,
  p_require_different_approver boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller_id uuid;
  v_approver "User"%ROWTYPE;
  v_request "RoleChangeRequest"%ROWTYPE;
  v_remaining_admins int;
BEGIN
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_approver_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  SELECT * INTO v_approver FROM "User" WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approver_not_found';
  END IF;
  IF v_approver.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'approver_not_active';
  END IF;
  IF v_approver.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'approver_not_authorized';
  END IF;

  UPDATE "RoleChangeRequest"
     SET status = 'APPROVED', "approvedBy" = p_approver_id, "resolvedAt" = now()
   WHERE id = p_request_id
     AND status = 'PENDING'
     AND (p_require_different_approver = false OR "requestedBy" <> p_approver_id)
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_change_request_not_approvable';
  END IF;

  IF v_request."fromRole" = 'ADMIN' OR v_request."toRole" = 'ADMIN' THEN
    PERFORM pg_advisory_xact_lock(43, 0);

    IF v_request."fromRole" = 'ADMIN' AND v_request."toRole" <> 'ADMIN' THEN
      SELECT count(*) INTO v_remaining_admins
        FROM "User" WHERE role = 'ADMIN' AND id <> v_request."targetUserId";
      IF v_remaining_admins = 0 THEN
        RAISE EXCEPTION 'cannot_demote_last_platform_admin';
      END IF;
    END IF;
  END IF;

  UPDATE "User"
     SET role = v_request."toRole", "tokensValidAfter" = now()
   WHERE id = v_request."targetUserId";

  INSERT INTO "AuditLog"
    (id, "actorUserId", "actorType", action, "targetType", "targetId", "beforeValue", "afterValue", "occurredAt")
  VALUES
    (gen_random_uuid(), p_approver_id, 'USER', 'user.role.changed', 'User', v_request."targetUserId",
     jsonb_build_object('role', v_request."fromRole"), jsonb_build_object('role', v_request."toRole"), now());
END;
$$;

CREATE OR REPLACE FUNCTION set_org_role(
  p_membership_id uuid,
  p_new_org_role text,
  p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller_id uuid;
  v_actor "User"%ROWTYPE;
  v_actor_membership "OrganizationMembership"%ROWTYPE;
  v_before text;
  v_org_id uuid;
  v_user_id uuid;
  v_remaining_admins int;
BEGIN
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_actor_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  SELECT "organizationId", "userId" INTO v_org_id, v_user_id
    FROM "OrganizationMembership" WHERE id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(44, hashtext(v_org_id::text));

  SELECT * INTO v_actor FROM "User" WHERE id = p_actor_id;
  IF NOT FOUND OR v_actor.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'actor_not_found_or_inactive';
  END IF;
  IF v_actor.role <> 'ADMIN' THEN
    SELECT * INTO v_actor_membership FROM "OrganizationMembership"
      WHERE "userId" = p_actor_id AND "organizationId" = v_org_id;
    IF NOT FOUND OR v_actor_membership."orgRole" <> 'ENTERPRISE_ADMIN' THEN
      RAISE EXCEPTION 'actor_not_authorized_for_organization';
    END IF;
  END IF;

  SELECT "orgRole" INTO v_before FROM "OrganizationMembership" WHERE id = p_membership_id;

  IF v_before = 'ENTERPRISE_ADMIN' AND p_new_org_role <> 'ENTERPRISE_ADMIN' THEN
    SELECT count(*) INTO v_remaining_admins FROM "OrganizationMembership"
      WHERE "organizationId" = v_org_id AND "orgRole" = 'ENTERPRISE_ADMIN' AND id <> p_membership_id;
    IF v_remaining_admins = 0 THEN
      RAISE EXCEPTION 'cannot_demote_last_enterprise_admin';
    END IF;
  END IF;

  UPDATE "OrganizationMembership" SET "orgRole" = p_new_org_role WHERE id = p_membership_id;
  UPDATE "User" SET "tokensValidAfter" = now() WHERE id = v_user_id;

  INSERT INTO "AuditLog"
    (id, "actorUserId", "actorType", action, "targetType", "targetId", "tenantId", "beforeValue", "afterValue", "occurredAt")
  VALUES
    (gen_random_uuid(), p_actor_id, 'USER', 'organization.member.role_changed', 'OrganizationMembership', p_membership_id, v_org_id,
     jsonb_build_object('orgRole', v_before), jsonb_build_object('orgRole', p_new_org_role), now());
END;
$$;

CREATE OR REPLACE FUNCTION complete_mfa_enrollment(p_user_id uuid, p_verified_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  UPDATE "User" SET "mfaEnrolled" = true, "mfaSecret" = p_verified_secret WHERE id = p_user_id;
  INSERT INTO "AuditLog" (id, "actorUserId", "actorType", action, "targetType", "targetId", "occurredAt")
  VALUES (gen_random_uuid(), p_user_id, 'USER', 'user.mfa.enrolled', 'User', p_user_id, now());
END;
$$;
