-- CreateEnum
CREATE TYPE "AgentPersona" AS ENUM ('PERSONAL_LANGUAGE_TEACHER', 'CONVERSATION_PARTNER', 'GRAMMAR_COACH', 'PRONUNCIATION_COACH', 'VOCABULARY_COACH', 'WRITING_COACH', 'EXAM_COACH');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STREAK_REMINDER', 'MILESTONE', 'BILLING_RECEIPT', 'SECURITY_ALERT', 'MARKETING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED');

-- Prisma-generated DROP INDEX statements for AIMemoryEntry/
-- KnowledgeBaseEntry's hand-authored HNSW indexes removed here --
-- expected, recurring, see 20260806202247_add_gamification_entities's own
-- comment for the full explanation.

-- AlterTable
ALTER TABLE "ProficiencyLevelHistory" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "producedBy" TEXT NOT NULL,
    "userId" UUID,
    "organizationId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id","createdAt")
) PARTITION BY RANGE ("createdAt");

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "agentPersona" "AgentPersona" NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsdMicros" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id","createdAt")
) PARTITION BY RANGE ("createdAt");

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "optedIn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningEvent_userId_createdAt_idx" ON "LearningEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningEvent_type_createdAt_idx" ON "LearningEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "LearningEvent_organizationId_idx" ON "LearningEvent"("organizationId");

-- CreateIndex
-- Plain index, not unique -- see schema/analytics.prisma's LearningEvent.eventId
-- field comment for why a unique constraint here can't actually enforce
-- eventId-level idempotency on a partitioned table (found via this
-- domain's own verification script: two rows with the same eventId but
-- different createdAt both succeeded against an earlier
-- `@@unique([eventId, createdAt])` attempt).
CREATE INDEX "LearningEvent_eventId_idx" ON "LearningEvent"("eventId");

-- CreateIndex
CREATE INDEX "AIUsageLog_userId_createdAt_idx" ON "AIUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_agentPersona_createdAt_idx" ON "AIUsageLog"("agentPersona", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_createdAt_idx" ON "NotificationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_type_key" ON "NotificationPreference"("userId", "channel", "type");

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageLog" ADD CONSTRAINT "AIUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual additions (E4 T10): pg_partman-managed monthly partitioning for
-- LearningEvent and AIUsageLog, reusing T5's mechanism (ADR-028, §6.5) --
-- decided once, applied here as a reuse. Unquoted "schema.Table" form,
-- per T5's own empirically-confirmed finding (pre-quoted identifier
-- strings are rejected by create_parent).
SELECT partman.create_parent(
    p_parent_table := 'public.LearningEvent',
    p_control := 'createdAt',
    p_interval := '1 month'
);
SELECT partman.create_parent(
    p_parent_table := 'public.AIUsageLog',
    p_control := 'createdAt',
    p_interval := '1 month'
);
