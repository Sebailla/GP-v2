-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "userAgent" VARCHAR(512);

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "ipAddress" VARCHAR(45);

-- CreateIndex
CREATE INDEX "sessions_lastActiveAt_idx" ON "sessions"("lastActiveAt");
