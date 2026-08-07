-- E6 T1 (ADR-037): curated placement-test item bank — closes a real gap
-- (E6 design doc §3.1): no reusable, standalone item bank existed
-- anywhere in the schema before this. Generated via `prisma migrate
-- diff --from-url ... --to-schema-datamodel ./schema --script` against
-- the live database, then hand-edited to strip two spurious
-- `DROP INDEX` statements the diff engine emitted for
-- AIMemoryEntry_embedding_hnsw_idx / KnowledgeBaseEntry_embedding_hnsw_idx
-- -- the same known issue T6/T9's own migrations already documented:
-- Prisma's diff engine has no representation for a hand-authored HNSW
-- vector index (`Unsupported("vector(n)")` fields, ai.prisma's own field
-- comment) and always proposes dropping them on any further diff: a
-- false positive, not a real schema change this migration should make.

-- CreateEnum
CREATE TYPE "AssessmentItemType" AS ENUM ('MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'OPEN_RESPONSE');

-- AlterTable
ALTER TABLE "AssessmentResponse" ADD COLUMN     "itemId" UUID;

-- CreateTable
CREATE TABLE "AssessmentItem" (
    "id" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "skill" "Skill" NOT NULL,
    "cefrLevel" "CefrLevel" NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "prompt" TEXT NOT NULL,
    "audioUrl" TEXT,
    "correctAnswer" JSONB,
    "itemType" "AssessmentItemType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "linguistSignOffBy" TEXT,
    "linguistSignOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentItem_languageId_skill_cefrLevel_isActive_idx" ON "AssessmentItem"("languageId", "skill", "cefrLevel", "isActive");

-- CreateIndex
CREATE INDEX "AssessmentResponse_itemId_idx" ON "AssessmentResponse"("itemId");

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AssessmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
