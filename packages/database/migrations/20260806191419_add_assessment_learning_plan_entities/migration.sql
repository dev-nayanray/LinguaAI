-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('READING', 'WRITING', 'LISTENING', 'SPEAKING', 'VOCABULARY', 'GRAMMAR');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('PLACEMENT', 'REASSESSMENT');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ProficiencySource" AS ENUM ('ASSESSMENT', 'INFERRED');

-- DropForeignKey
ALTER TABLE "ExerciseAttempt" DROP CONSTRAINT "ExerciseAttempt_userId_fkey";

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResponse" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "skill" "Skill" NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyLevel" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "skill" "Skill" NOT NULL,
    "cefrLevel" "CefrLevel" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" "ProficiencySource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProficiencyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyLevelHistory" (
    "id" UUID NOT NULL,
    "proficiencyLevelId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "skill" "Skill" NOT NULL,
    "cefrLevel" "CefrLevel" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" "ProficiencySource" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProficiencyLevelHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "goal" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "milestones" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyGoal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "learningPlanId" UUID,
    "date" DATE NOT NULL,
    "targetXp" INTEGER NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "targetActivities" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentAttempt_userId_createdAt_idx" ON "AssessmentAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_languageId_idx" ON "AssessmentAttempt"("languageId");

-- CreateIndex
CREATE INDEX "AssessmentResponse_attemptId_idx" ON "AssessmentResponse"("attemptId");

-- CreateIndex
CREATE INDEX "ProficiencyLevel_userId_languageId_idx" ON "ProficiencyLevel"("userId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyLevel_userId_languageId_skill_key" ON "ProficiencyLevel"("userId", "languageId", "skill");

-- CreateIndex
CREATE INDEX "ProficiencyLevelHistory_userId_languageId_skill_idx" ON "ProficiencyLevelHistory"("userId", "languageId", "skill");

-- CreateIndex
CREATE INDEX "ProficiencyLevelHistory_proficiencyLevelId_idx" ON "ProficiencyLevelHistory"("proficiencyLevelId");

-- CreateIndex
CREATE INDEX "LearningPlan_userId_languageId_idx" ON "LearningPlan"("userId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGoal_userId_date_key" ON "DailyGoal"("userId", "date");

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyLevelHistory" ADD CONSTRAINT "ProficiencyLevelHistory_proficiencyLevelId_fkey" FOREIGN KEY ("proficiencyLevelId") REFERENCES "ProficiencyLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyGoal" ADD CONSTRAINT "DailyGoal_learningPlanId_fkey" FOREIGN KEY ("learningPlanId") REFERENCES "LearningPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual additions (E4 T3): cross-domain FKs for the plain-scalar
-- userId/languageId columns this domain's schema/assessment.prisma
-- deliberately doesn't model as Prisma @relations (this file's own
-- header comment explains why). ON DELETE RESTRICT throughout, matching
-- T2's own reasoning: E2's GDPR-erasure mechanism anonymizes User rows
-- in place rather than issuing a real DELETE, so RESTRICT is the safe
-- default absent a later task's more specific design.
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProficiencyLevel" ADD CONSTRAINT "ProficiencyLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProficiencyLevel" ADD CONSTRAINT "ProficiencyLevel_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProficiencyLevelHistory" ADD CONSTRAINT "ProficiencyLevelHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProficiencyLevelHistory" ADD CONSTRAINT "ProficiencyLevelHistory_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyGoal" ADD CONSTRAINT "DailyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
