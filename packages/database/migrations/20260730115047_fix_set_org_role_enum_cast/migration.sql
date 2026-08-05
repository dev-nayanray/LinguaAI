-- E2-T5 remediation #3: set_org_role()'s UPDATE assigned the text-typed
-- p_new_org_role parameter directly to "OrganizationMembership"."orgRole"
-- (an OrgRole enum column). Confirmed empirically this fails --
-- "column \"orgRole\" is of type \"OrgRole\" but expression is of type
-- text" -- unlike approve_role_change()'s analogous assignment, which
-- works uncast only because its source (v_request."toRole") is ALREADY
-- Role-typed, not text. No implicit text->enum assignment cast exists in
-- Postgres; an explicit cast is required. Same signature as before, so a
-- plain CREATE OR REPLACE (no DROP) is sufficient this time.

CREATE OR REPLACE FUNCTION set_org_role(
  p_membership_id uuid,
  p_new_org_role text,
  p_actor_id uuid,
  p_correlation_id uuid
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

  UPDATE "OrganizationMembership" SET "orgRole" = p_new_org_role::"OrgRole" WHERE id = p_membership_id;
  UPDATE "User" SET "tokensValidAfter" = now() WHERE id = v_user_id;

  INSERT INTO "AuditLog"
    (id, "actorUserId", "actorType", action, "targetType", "targetId", "tenantId", "correlationId", "beforeValue", "afterValue", "occurredAt")
  VALUES
    (gen_random_uuid(), p_actor_id, 'USER', 'organization.member.role_changed', 'OrganizationMembership', p_membership_id, v_org_id, p_correlation_id,
     jsonb_build_object('orgRole', v_before), jsonb_build_object('orgRole', p_new_org_role), now());
END;
$$;

ALTER FUNCTION set_org_role(uuid, text, uuid, uuid) OWNER TO governance_role;
GRANT EXECUTE ON FUNCTION set_org_role(uuid, text, uuid, uuid) TO app_role;
