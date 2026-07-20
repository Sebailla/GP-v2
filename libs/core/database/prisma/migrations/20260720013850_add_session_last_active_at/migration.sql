-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sessions_lastActiveAt_idx" ON "sessions"("lastActiveAt");
