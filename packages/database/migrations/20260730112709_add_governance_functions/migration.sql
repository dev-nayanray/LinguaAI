-- E2-T5: SECURITY DEFINER governance functions + their owner role +
-- app_service_role (BYPASSRLS). SQL for the three functions is transcribed
-- verbatim from docs/epics/E2-identity-access-platform.md Part 9C
-- (post-remediation-pass-#4, the fourth-targeted-review-approved version).

-- ============================================================================
-- governance_role: owns the three functions below. NOLOGIN — nothing ever
-- connects AS this role directly; it exists purely so SECURITY DEFINER
-- execution runs with a narrowly-scoped privilege set, not the
-- migration-running superuser's. Closes the standing "function ownership
-- unspecified" item carried since the third targeted review.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'governance_role') THEN
    CREATE ROLE governance_role WITH NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO governance_role;
-- Exactly the columns/tables the three functions below touch — nothing
-- broader, matching the same minimal-privilege principle Part 9C's
-- app_role allowlist already applies.
GRANT SELECT ON "User", "OrganizationMembership", "RoleChangeRequest" TO governance_role;
GRANT UPDATE (role, "tokensValidAfter", "mfaEnrolled", "mfaSecret") ON "User" TO governance_role;
GRANT UPDATE ("orgRole") ON "OrganizationMembership" TO governance_role;
GRANT UPDATE (status, "approvedBy", "resolvedAt") ON "RoleChangeRequest" TO governance_role;
GRANT INSERT ON "AuditLog" TO governance_role;

-- ============================================================================
-- app_service_role: BYPASSRLS, for the narrow set of operations that must
-- run before/across normal RLS session context (Part 9's "Service-role
-- exception") — registration, OAuth account creation, this task's
-- bootstrap-admin CLI, and the (not-yet-built) GDPR-erasure job. Idempotent
-- for the same reason app_role's creation was (E2-T4) — safe to replay into
-- a fresh local/CI database.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_service_role') THEN
    CREATE ROLE app_service_role WITH LOGIN PASSWORD 'app_service_role_dev_password' BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE linguaai TO app_service_role;
GRANT USAGE ON SCHEMA public TO app_service_role;
-- Broad, unlike app_role: this role's entire reason to exist is operating
-- outside the normal row/column restrictions (Part 9C's "different problem"
-- distinction) — narrowing it the way E2-T6 narrows app_role would defeat
-- its purpose.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service_role;

-- ============================================================================
-- approve_role_change()
-- ============================================================================
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
  -- Finding 3: never trust the caller-supplied approver ID.
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_approver_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  -- Finding 4: the approver must exist, be active, and actually hold ADMIN —
  -- not merely have passed RolesGuard at the application layer.
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
  -- ADMIN is platform-wide, not tenant-scoped (ARCHITECTURE.md §2.1) — there
  -- is no separate "correct tenant/context" check for this function; that
  -- requirement is satisfied by "must hold platform ADMIN" having no
  -- tenant dimension to begin with.

  -- Atomic claim (unchanged from pass #2) — also enforces "not the
  -- prohibited actor" (requester) where applicable.
  UPDATE "RoleChangeRequest"
     SET status = 'APPROVED', "approvedBy" = p_approver_id, "resolvedAt" = now()
   WHERE id = p_request_id
     AND status = 'PENDING'
     AND (p_require_different_approver = false OR "requestedBy" <> p_approver_id)
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_change_request_not_approvable';
  END IF;

  -- Finding 1: evaluate the TARGET user, under a global advisory lock, only
  -- when this change actually touches the ADMIN tier in either direction.
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
    ("actorUserId", "actorType", action, "targetType", "targetId", "beforeValue", "afterValue", "occurredAt")
  VALUES
    (p_approver_id, 'USER', 'user.role.changed', 'User', v_request."targetUserId",
     jsonb_build_object('role', v_request."fromRole"), jsonb_build_object('role', v_request."toRole"), now());
END;
$$;

ALTER FUNCTION approve_role_change(uuid, uuid, boolean) OWNER TO governance_role;
GRANT EXECUTE ON FUNCTION approve_role_change(uuid, uuid, boolean) TO app_role;

-- ============================================================================
-- set_org_role()
-- ============================================================================
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
  -- Finding 3
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_actor_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  SELECT "organizationId", "userId" INTO v_org_id, v_user_id
    FROM "OrganizationMembership" WHERE id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found';
  END IF;

  -- Finding 2: deterministic, org-scoped serialization BEFORE any read of
  -- membership state this function's decision depends on.
  PERFORM pg_advisory_xact_lock(44, hashtext(v_org_id::text));

  -- Actor must exist, be active, and be authorized for *this* org
  -- specifically (Finding 4's spirit, applied to the org-scoped case):
  -- either a platform ADMIN, or an ENTERPRISE_ADMIN of v_org_id.
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

  -- Re-read orgRole now that the lock is held — the value read before
  -- acquiring the lock (if any) cannot be trusted.
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
    ("actorUserId", "actorType", action, "targetType", "targetId", "tenantId", "beforeValue", "afterValue", "occurredAt")
  VALUES
    (p_actor_id, 'USER', 'organization.member.role_changed', 'OrganizationMembership', p_membership_id, v_org_id,
     jsonb_build_object('orgRole', v_before), jsonb_build_object('orgRole', p_new_org_role), now());
END;
$$;

ALTER FUNCTION set_org_role(uuid, text, uuid) OWNER TO governance_role;
GRANT EXECUTE ON FUNCTION set_org_role(uuid, text, uuid) TO app_role;

-- ============================================================================
-- complete_mfa_enrollment()
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_mfa_enrollment(p_user_id uuid, p_verified_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  -- Caller (mfa.service.ts) has already verified a real TOTP code against
  -- p_verified_secret before calling this — this function's job is to make
  -- the resulting write to two otherwise-locked-down columns atomic and
  -- auditable, and to confirm the caller is who they claim, not to
  -- re-verify the code itself.
  UPDATE "User" SET "mfaEnrolled" = true, "mfaSecret" = p_verified_secret WHERE id = p_user_id;
  INSERT INTO "AuditLog" ("actorUserId", "actorType", action, "targetType", "targetId", "occurredAt")
  VALUES (p_user_id, 'USER', 'user.mfa.enrolled', 'User', p_user_id, now());
END;
$$;

ALTER FUNCTION complete_mfa_enrollment(uuid, text) OWNER TO governance_role;
GRANT EXECUTE ON FUNCTION complete_mfa_enrollment(uuid, text) TO app_role;
