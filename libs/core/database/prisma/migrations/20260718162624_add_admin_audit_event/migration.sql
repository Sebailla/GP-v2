-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('REVOKE_SESSION', 'REVOKE_ALL_SESSIONS', 'CHANGE_ROLE');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "admin_audit_events" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_events_createdAt_idx" ON "admin_audit_events"("createdAt");