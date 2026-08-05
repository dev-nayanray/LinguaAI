-- Same gap as E2-T6's `User.updatedAt` grant (20260731120000): `app_service_role`'s
-- own blanket grant ("GRANT ... ON ALL TABLES IN SCHEMA public TO app_service_role",
-- E2-T5) only ever covered tables that existed at that moment. MfaChallengeToken
-- (E2-T22, migration 20260731130000) postdates it, so app_service_role has zero
-- privileges on this table without this explicit grant — confirmed empirically
-- (a real "permission denied for table MfaChallengeToken" from AuthService's
-- servicePrisma calls, the same pre-session category as PasswordResetToken's
-- read/write path, which predates T5's blanket grant and so never needed this).
GRANT SELECT, INSERT, UPDATE ON "MfaChallengeToken" TO app_service_role;
