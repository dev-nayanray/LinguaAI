-- CreateTable
CREATE TABLE "GeneratedStory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "languageId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "storyText" TEXT NOT NULL,
    "vocabularyUsed" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedStory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedStory_userId_createdAt_idx" ON "GeneratedStory"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedStory" ADD CONSTRAINT "GeneratedStory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedStory" ADD CONSTRAINT "GeneratedStory_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
