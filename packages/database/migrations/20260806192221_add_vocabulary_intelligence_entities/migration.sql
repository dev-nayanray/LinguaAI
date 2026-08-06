-- CreateEnum
CREATE TYPE "PartOfSpeech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PRONOUN', 'PREPOSITION', 'CONJUNCTION', 'INTERJECTION', 'PHRASE', 'OTHER');

-- CreateEnum
CREATE TYPE "VocabularySource" AS ENUM ('READING', 'CAMERA_TRANSLATION', 'CONVERSATION', 'MANUAL', 'OTHER');

-- DropForeignKey
ALTER TABLE "AssessmentAttempt" DROP CONSTRAINT "AssessmentAttempt_languageId_fkey";

-- DropForeignKey
ALTER TABLE "AssessmentAttempt" DROP CONSTRAINT "AssessmentAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "DailyGoal" DROP CONSTRAINT "DailyGoal_userId_fkey";

-- DropForeignKey
ALTER TABLE "LearningPlan" DROP CONSTRAINT "LearningPlan_languageId_fkey";

-- DropForeignKey
ALTER TABLE "LearningPlan" DROP CONSTRAINT "LearningPlan_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProficiencyLevel" DROP CONSTRAINT "ProficiencyLevel_languageId_fkey";

-- DropForeignKey
ALTER TABLE "ProficiencyLevel" DROP CONSTRAINT "ProficiencyLevel_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProficiencyLevelHistory" DROP CONSTRAINT "ProficiencyLevelHistory_languageId_fkey";

-- DropForeignKey
ALTER TABLE "ProficiencyLevelHistory" DROP CONSTRAINT "ProficiencyLevelHistory_userId_fkey";

-- CreateTable
CREATE TABLE "VocabularyItem" (
    "id" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "term" TEXT NOT NULL,
    "partOfSpeech" "PartOfSpeech" NOT NULL,
    "translations" JSONB NOT NULL,
    "audioUrl" TEXT,
    "exampleSentences" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVocabulary" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "vocabularyItemId" UUID NOT NULL,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalDictionary" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "term" TEXT NOT NULL,
    "translation" TEXT,
    "source" "VocabularySource" NOT NULL,
    "notes" TEXT,
    "vocabularyItemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalDictionary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabularyItem_languageId_idx" ON "VocabularyItem"("languageId");

-- CreateIndex
CREATE INDEX "UserVocabulary_userId_nextReviewAt_idx" ON "UserVocabulary"("userId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserVocabulary_userId_vocabularyItemId_key" ON "UserVocabulary"("userId", "vocabularyItemId");

-- CreateIndex
CREATE INDEX "PersonalDictionary_userId_languageId_idx" ON "PersonalDictionary"("userId", "languageId");

-- CreateIndex
CREATE INDEX "PersonalDictionary_vocabularyItemId_idx" ON "PersonalDictionary"("vocabularyItemId");

-- AddForeignKey
ALTER TABLE "UserVocabulary" ADD CONSTRAINT "UserVocabulary_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalDictionary" ADD CONSTRAINT "PersonalDictionary_vocabularyItemId_fkey" FOREIGN KEY ("vocabularyItemId") REFERENCES "VocabularyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual additions (E4 T4): cross-domain FKs for the plain-scalar
-- userId/languageId columns, per this file's own header comment.
ALTER TABLE "VocabularyItem" ADD CONSTRAINT "VocabularyItem_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserVocabulary" ADD CONSTRAINT "UserVocabulary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalDictionary" ADD CONSTRAINT "PersonalDictionary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalDictionary" ADD CONSTRAINT "PersonalDictionary_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
