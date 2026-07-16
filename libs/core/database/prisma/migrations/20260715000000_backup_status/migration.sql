-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "performedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "bytes" INTEGER,
    "storageKey" TEXT,
    "message" TEXT,
    "environment" TEXT NOT NULL,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);