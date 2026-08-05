-- CreateTable
CREATE TABLE "MfaVerificationAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaVerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MfaVerificationAttempt_userId_occurredAt_idx" ON "MfaVerificationAttempt"("userId", "occurredAt");

-- Same reason as E2-T11's OAuthState grant: the T4 blanket
-- "GRANT ... ON ALL TABLES IN SCHEMA public" only ever covered tables that
-- existed at that moment — every table added since needs its own explicit
-- grant. No UPDATE/DELETE: this table is append-only (no single-use claim,
-- unlike OAuthState/RefreshToken — old rows simply age out of the
-- 10-minute lockout lookback window).
GRANT SELECT, INSERT ON "MfaVerificationAttempt" TO app_role;
