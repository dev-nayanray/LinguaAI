-- E2-T6: Column-level privilege allowlist (REVOKE/GRANT) — closes app_role's
-- direct write access to every privileged column identified in Part 9C's
-- survey. Transcribed verbatim from the E2 design doc, Part 9C "Column
-- privilege grants" (lines 642-657). Run only after E2-T5's governance
-- functions are verified working (implementation plan's explicit sequencing
-- rule), since those functions are the only remaining write path for the
-- columns revoked here — governance_role's own grants (E2-T5) are on a
-- separate role and are unaffected by these REVOKEs on app_role.

-- User: explicit allowlist. Everything else (role, organizationId, mfaEnrolled,
-- mfaSecret, tokensValidAfter, status, passwordHash) is reachable only via
-- app_service_role or the SECURITY DEFINER functions (E2-T5).
REVOKE UPDATE ON "User" FROM app_role;
GRANT UPDATE ("displayName", "avatarUrl", "locale", "timezone") ON "User" TO app_role;

-- OrganizationMembership: no freely-updatable columns at this Epic's scope —
-- membership rows are insert/delete-oriented; orgRole changes go through
-- set_org_role() only.
REVOKE UPDATE ON "OrganizationMembership" FROM app_role;

-- RoleChangeRequest: app_role may INSERT the initiate step (Part 6); the
-- resolution fields are written only by approve_role_change().
REVOKE UPDATE ON "RoleChangeRequest" FROM app_role;
