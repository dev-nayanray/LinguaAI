-- CreateEnum
CREATE TYPE "OrchestratorAgentPersona" AS ENUM ('PERSONAL_LANGUAGE_TEACHER', 'CONVERSATION_PARTNER', 'VOCABULARY_COACH', 'WRITING_COACH', 'EXAM_COACH');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('MISTAKE', 'INTEREST', 'GOAL', 'OTHER');

-- CreateEnum
CREATE TYPE "KnowledgeBaseCategory" AS ENUM ('CEFR_DESCRIPTOR', 'GRAMMAR_REFERENCE', 'EXAM_RUBRIC', 'OTHER');

-- CreateEnum
CREATE TYPE "PronunciationScoreSource" AS ENUM ('AI_MESSAGE', 'PRONUNCIATION_LAB_ATTEMPT');

-- CreateTable
CREATE TABLE "EncryptionDataKey" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "kmsKeyId" TEXT,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "EncryptionDataKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAgentSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "orchestratorAgent" "OrchestratorAgentPersona" NOT NULL,
    "specialistInvocations" JSONB,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "audioUrl" TEXT,
    "latencyMs" INTEGER,
    "promptVersion" TEXT,
    "modelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id","createdAt")
) PARTITION BY RANGE ("createdAt");

-- CreateTable
CREATE TABLE "AIMemoryEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "category" "MemoryCategory" NOT NULL,
    "fact" TEXT NOT NULL,
    "embedding" vector(1536),
    "embeddingModelVersion" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastReinforcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseEntry" (
    "id" UUID NOT NULL,
    "languageId" UUID,
    "category" "KnowledgeBaseCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "embeddingModelVersion" TEXT NOT NULL,
    "knowledgeBaseVersion" TEXT NOT NULL,
    "linguistSignOffBy" TEXT,
    "linguistSignOffAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PronunciationScore" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceType" "PronunciationScoreSource" NOT NULL,
    "sourceId" UUID NOT NULL,
    "phonemeScores" JSONB NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PronunciationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluencyScore" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "componentScores" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FluencyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncryptionDataKey_purpose_retiredAt_idx" ON "EncryptionDataKey"("purpose", "retiredAt");

-- CreateIndex
CREATE INDEX "AIAgentSession_userId_startedAt_idx" ON "AIAgentSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "AIAgentSession_languageId_idx" ON "AIAgentSession"("languageId");

-- CreateIndex
CREATE INDEX "AIMessage_sessionId_createdAt_idx" ON "AIMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AIMemoryEntry_userId_languageId_idx" ON "AIMemoryEntry"("userId", "languageId");

-- CreateIndex
CREATE INDEX "KnowledgeBaseEntry_languageId_category_isActive_idx" ON "KnowledgeBaseEntry"("languageId", "category", "isActive");

-- CreateIndex
CREATE INDEX "PronunciationScore_userId_createdAt_idx" ON "PronunciationScore"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PronunciationScore_sourceType_sourceId_idx" ON "PronunciationScore"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "FluencyScore_sessionId_idx" ON "FluencyScore"("sessionId");

-- AddForeignKey
ALTER TABLE "AIAgentSession" ADD CONSTRAINT "AIAgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAgentSession" ADD CONSTRAINT "AIAgentSession_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIAgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMemoryEntry" ADD CONSTRAINT "AIMemoryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMemoryEntry" ADD CONSTRAINT "AIMemoryEntry_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseEntry" ADD CONSTRAINT "KnowledgeBaseEntry_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PronunciationScore" ADD CONSTRAINT "PronunciationScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluencyScore" ADD CONSTRAINT "FluencyScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIAgentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual additions (E4 T5):

-- 1. pg_partman-managed monthly partitioning for AIMessage (ADR-028).
-- AIMessage was declared PARTITION BY RANGE ("createdAt") above -- Prisma
-- has no schema-language representation for native partitioning, so this
-- statement (like the vector column type before it) is hand-authored, not
-- generated. create_parent's defaults (p_premake=4, p_default_table=true)
-- pre-create four future monthly partitions plus a catch-all default
-- partition for any row outside the currently-managed range; ongoing
-- partition creation is pg_partman's own scheduled maintenance
-- (partman.run_maintenance_proc()), not a BullMQ job (E4 §6.5).
-- pg_partman wants the unquoted "schema.Table" display form here (it
-- applies its own identifier quoting internally) -- confirmed empirically
-- against a throwaway table: `'public."AIMessage"'` (pre-quoted) fails
-- with "Unable to find given parent table in system catalogs," while
-- `'public.AIMessage'` (unquoted, mixed case preserved) succeeds.
SELECT partman.create_parent(
    p_parent_table := 'public.AIMessage',
    p_control := 'createdAt',
    p_interval := '1 month'
);

-- 2. HNSW vector indexes (§6.3) -- Prisma's schema language has no
-- representation for a vector index type, same reasoning as the column
-- type itself. Cosine distance, matching AI_SYSTEM.md's own retrieval
-- model (semantic similarity, not L2/inner-product).
CREATE INDEX "AIMemoryEntry_embedding_hnsw_idx" ON "AIMemoryEntry" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "KnowledgeBaseEntry_embedding_hnsw_idx" ON "KnowledgeBaseEntry" USING hnsw ("embedding" vector_cosine_ops);
