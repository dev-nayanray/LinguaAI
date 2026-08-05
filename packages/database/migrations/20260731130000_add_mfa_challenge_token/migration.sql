-- CreateTable
CREATE TABLE "MfaChallengeToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "MfaChallengeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MfaChallengeToken_tokenHash_key" ON "MfaChallengeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MfaChallengeToken_userId_idx" ON "MfaChallengeToken"("userId");

-- AddForeignKey
ALTER TABLE "MfaChallengeToken" ADD CONSTRAINT "MfaChallengeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same reason as every other post-T4 table (OAuthState, MfaVerificationAttempt,
-- the grant_user_updated_at_column migration): the blanket
-- "GRANT ... ON ALL TABLES IN SCHEMA public" (E2-T4) only ever covered
-- tables that existed at that moment. No RLS on this table — same as
-- PasswordResetToken/OAuthState/Session/RefreshToken (Part 9's policy
-- matrix covers only User/Organization/OrganizationMembership); app_role
-- does its own userId scoping in the query layer, and this table's own
-- tokenHash uniqueness is what actually protects it (an attacker needs the
-- raw, never-persisted token to look one up at all).
GRANT SELECT, INSERT, UPDATE ON "MfaChallengeToken" TO app_role;
