-- CreateEnum
CREATE TYPE "MockDraftStatus" AS ENUM ('ACTIVE', 'COMPLETE');

-- CreateTable
CREATE TABLE "MockDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "order" JSONB NOT NULL,
    "humanSeat" TEXT NOT NULL,
    "picks" JSONB NOT NULL,
    "currentPickIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "MockDraftStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MockDraft_userId_key" ON "MockDraft"("userId");

-- AddForeignKey
ALTER TABLE "MockDraft" ADD CONSTRAINT "MockDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
