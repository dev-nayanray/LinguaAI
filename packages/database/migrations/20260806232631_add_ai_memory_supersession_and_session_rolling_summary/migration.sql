-- Prisma's auto-diff cannot see Unsupported("vector(n)") index types, so it
-- generated DROP INDEX statements for both hand-authored HNSW indexes here
-- (a recurring gap, first hit and documented in E4 T6 — see that task's own
-- evidence text). Stripped by hand before this migration's evidence was
-- verified; both indexes were recreated live via CREATE INDEX ... USING
-- hnsw (...) vector_cosine_ops immediately after this migration applied,
-- and this file no longer drops them, so a fresh `prisma migrate deploy`
-- (CI, a new clone) does not repeat the same destructive step.

-- AlterTable
ALTER TABLE "AIAgentSession" ADD COLUMN     "rollingSummary" TEXT,
ADD COLUMN     "summarizedThroughAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AIMemoryEntry" ADD COLUMN     "supersededByEntryId" UUID;

-- CreateIndex
CREATE INDEX "AIMemoryEntry_supersededByEntryId_idx" ON "AIMemoryEntry"("supersededByEntryId");

-- AddForeignKey
ALTER TABLE "AIMemoryEntry" ADD CONSTRAINT "AIMemoryEntry_supersededByEntryId_fkey" FOREIGN KEY ("supersededByEntryId") REFERENCES "AIMemoryEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
