/*
  Warnings:

  - You are about to drop the column `organizationId` on the `LearningEvent` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "LearningEvent" DROP CONSTRAINT "LearningEvent_organizationId_fkey";

-- Prisma-generated DROP INDEX statements for AIMemoryEntry/
-- KnowledgeBaseEntry's hand-authored HNSW indexes removed here --
-- expected, recurring, see 20260806202247_add_gamification_entities's own
-- comment for the full explanation.

-- DropIndex
DROP INDEX "LearningEvent_organizationId_idx";

-- AlterTable
ALTER TABLE "LearningEvent" DROP COLUMN "organizationId";
