-- CreateTable
CREATE TABLE "MockTestSection" (
    "id" UUID NOT NULL,
    "examProgramId" UUID NOT NULL,
    "skill" "Skill" NOT NULL,
    "order" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockTestSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockTestSection_examProgramId_idx" ON "MockTestSection"("examProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "MockTestSection_examProgramId_skill_key" ON "MockTestSection"("examProgramId", "skill");

-- AddForeignKey
ALTER TABLE "MockTestSection" ADD CONSTRAINT "MockTestSection_examProgramId_fkey" FOREIGN KEY ("examProgramId") REFERENCES "ExamProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
