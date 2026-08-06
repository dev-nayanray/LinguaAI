-- Prisma-generated DROP INDEX statements for AIMemoryEntry/
-- KnowledgeBaseEntry's hand-authored HNSW indexes removed here --
-- expected, recurring, see 20260806202247_add_gamification_entities's own
-- comment for the full explanation.

-- CreateTable
CREATE TABLE "ExamProgram" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "rubric" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamProgramKnowledgeBaseEntry" (
    "id" UUID NOT NULL,
    "examProgramId" UUID NOT NULL,
    "knowledgeBaseEntryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamProgramKnowledgeBaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockTestAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "examProgramId" UUID NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "overallScore" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockTestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockTestSectionScore" (
    "id" UUID NOT NULL,
    "mockTestAttemptId" UUID NOT NULL,
    "skill" "Skill" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockTestSectionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "levelId" UUID,
    "examProgramId" UUID,
    "verificationTokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamProgram_code_key" ON "ExamProgram"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ExamProgramKnowledgeBaseEntry_examProgramId_knowledgeBaseEn_key" ON "ExamProgramKnowledgeBaseEntry"("examProgramId", "knowledgeBaseEntryId");

-- CreateIndex
CREATE INDEX "MockTestAttempt_userId_createdAt_idx" ON "MockTestAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MockTestAttempt_examProgramId_idx" ON "MockTestAttempt"("examProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "MockTestSectionScore_mockTestAttemptId_skill_key" ON "MockTestSectionScore"("mockTestAttemptId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_verificationTokenHash_key" ON "Certificate"("verificationTokenHash");

-- CreateIndex
CREATE INDEX "Certificate_userId_idx" ON "Certificate"("userId");

-- AddForeignKey
ALTER TABLE "ExamProgramKnowledgeBaseEntry" ADD CONSTRAINT "ExamProgramKnowledgeBaseEntry_examProgramId_fkey" FOREIGN KEY ("examProgramId") REFERENCES "ExamProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamProgramKnowledgeBaseEntry" ADD CONSTRAINT "ExamProgramKnowledgeBaseEntry_knowledgeBaseEntryId_fkey" FOREIGN KEY ("knowledgeBaseEntryId") REFERENCES "KnowledgeBaseEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTestAttempt" ADD CONSTRAINT "MockTestAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTestAttempt" ADD CONSTRAINT "MockTestAttempt_examProgramId_fkey" FOREIGN KEY ("examProgramId") REFERENCES "ExamProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockTestSectionScore" ADD CONSTRAINT "MockTestSectionScore_mockTestAttemptId_fkey" FOREIGN KEY ("mockTestAttemptId") REFERENCES "MockTestAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_examProgramId_fkey" FOREIGN KEY ("examProgramId") REFERENCES "ExamProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual addition (E4 T8): DATABASE.md §2.8 requires Certificate be
-- "explicitly foreign-keyed to the Course/Level/ExamProgram milestone
-- that triggered it" -- enforced above via three real, separate FKs
-- (not a polymorphic pointer). This CHECK constraint is what actually
-- enforces "explicitly," not just "possibly": exactly one of the three
-- must be set, never zero or more than one. Prisma's schema language has
-- no native CHECK-constraint representation (same "Prisma schema + raw
-- SQL" shape T1 established for RLS/vector, reused here for a
-- constraint type).
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_exactly_one_trigger_check"
  CHECK (num_nonnulls("courseId", "levelId", "examProgramId") = 1);
