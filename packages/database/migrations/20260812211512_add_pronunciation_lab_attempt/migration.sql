-- CreateTable
CREATE TABLE "PronunciationLabAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "targetPhrase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PronunciationLabAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PronunciationLabAttempt_userId_createdAt_idx" ON "PronunciationLabAttempt"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PronunciationLabAttempt" ADD CONSTRAINT "PronunciationLabAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PronunciationLabAttempt" ADD CONSTRAINT "PronunciationLabAttempt_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
