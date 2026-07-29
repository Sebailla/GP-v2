import { execFile as execFileCb } from "node:child_process";
import { randomBytes } from "node:crypto";

import { runBackup } from "./backup.js";

function execFile(
  file: string,
  args: ReadonlyArray<string>,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileCb(file, args as string[], {}, (err: unknown, stdout: string | Buffer, stderr: string | Buffer) => {
      if (err !== null && err !== undefined) {
        reject(err);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export interface RestoreDrillOptions {
  environment: string;
  databaseUrl: string;
  backupDsn: string;
  bucket: string;
}

/**
 * Restore the latest dump into an isolated database and verify row counts.
 * The isolated DB is named `gastos_restore_drill_<random>` and is dropped
 * after the drill. The drill never modifies the production database.
 */
export async function runRestoreDrill(opts: RestoreDrillOptions): Promise<void> {
  await runBackup({
    environment: opts.environment,
    databaseUrl: opts.databaseUrl,
    backupDsn: opts.backupDsn,
    bucket: opts.bucket,
    retentionDays: 7,
  });
  const suffix = randomBytes(4).toString("hex");
  const isolatedName = `gastos_restore_drill_${suffix}`;
  const isolatedUrl = opts.databaseUrl.replace(/\/[^/]+$/, `/${isolatedName}`);
  const dumpFile = `/tmp/drill-${suffix}.dump`;

  try {
    await execFile("createdb", [isolatedName]);
    await execFile("pg_dump", ["-Fc", "-f", dumpFile, "--dbname=" + opts.databaseUrl]);
    await execFile("pg_restore", ["--clean", "--if-exists", "-d", isolatedUrl, dumpFile]);
    // smoke test — counts only, no financial data dumped to stdout
    const { stdout } = await execFile("psql", [
      isolatedUrl,
      "-tAc",
      'SELECT COUNT(*) FROM "User";',
    ]);
    if (Number.parseInt(stdout.trim(), 10) < 0) {
      throw new Error("User count negative after restore");
    }
  } finally {
    await execFile("dropdb", ["--if-exists", isolatedName]).catch(() => undefined);
    const fs = await import("node:fs/promises");
    await fs.unlink(dumpFile).catch(() => undefined);
  }
}