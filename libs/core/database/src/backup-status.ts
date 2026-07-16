import { prisma } from "./client.js";

export type BackupStatusKind = "ok" | "failed" | "never";

export interface BackupStatus {
  at: Date | null;
  status: BackupStatusKind;
}

/**
 * Read the most recent `BackupRun` row. Returns `{ at: null, status: "never" }`
 * when no backup has ever run.
 */
export async function latestBackupStatus(
  environment: string,
): Promise<BackupStatus> {
  const row = await prisma.backupRun.findFirst({
    where: { environment },
    orderBy: { performedAt: "desc" },
  });
  if (row === null) return { at: null, status: "never" };
  const status: BackupStatusKind = row.status === "ok" ? "ok" : "failed";
  return { at: row.performedAt, status };
}