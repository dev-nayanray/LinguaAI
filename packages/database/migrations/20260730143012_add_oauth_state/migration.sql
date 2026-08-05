-- CreateTable
CREATE TABLE "OAuthState" (
    "id" UUID NOT NULL,
    "stateHash" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_stateHash_key" ON "OAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- Postgres's `GRANT ... ON ALL TABLES IN SCHEMA public` (E2-T4) only ever
-- applied to tables that existed at the moment it ran — it is not a
-- standing default for tables created afterward (that needs `ALTER
-- DEFAULT PRIVILEGES`, not used here). OAuthState is the first table added
-- since that blanket grant, so app_role has zero privileges on it without
-- this explicit grant — confirmed empirically via \dp before adding this.
-- No RLS on this table (same as Session/RefreshToken/PasswordResetToken —
-- Part 9's policy matrix covers only User/Organization/OrganizationMembership),
-- so a plain GRANT is sufficient; app_role does its own userId/provider
-- scoping in the query layer, matching those other ephemeral-token tables.
GRANT SELECT, INSERT, UPDATE ON "OAuthState" TO app_role;

