-- E2-T28 remediation: closes a real gap the security review found — Part 8
-- documents a JWT-jti Redis denylist for immediate single-session
-- revocation, but no column anywhere ever stored a session's issued jti to
-- denylist in the first place. See JtiDenylistService's own doc comment
-- (apps/api/src/modules/auth/jti-denylist.service.ts) for the full
-- rationale.
ALTER TABLE "Session" ADD COLUMN "currentJti" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_currentJti_key" ON "Session"("currentJti");

-- Session already has UPDATE granted to app_role from earlier migrations
-- (no privileged-column allowlist applies to this table, Part 9C's own
-- scope is User/OrganizationMembership only) — no new GRANT needed here.
