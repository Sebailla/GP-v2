import { execFile as execFileCb } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { prisma } from "@core/database";

/**
 * execFile is wrapped in a Promise so the production code never has
 * to manage callback-arity and so vitest can swap `node:child_process`
 * via `vi.mock`. The mock factory replaces `execFile` with a callback
 * invoker — the production wrapper below expects the callback form,
 * matching Node's documented `execFile(file, args, options, callback)`
 * signature.
 */
function execFile(
  file: string,
  args: ReadonlyArray<string>,
  options?: { maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileCb(
      file,
      args as string[],
      options ?? {},
      (err: unknown, stdout: string | Buffer, stderr: string | Buffer) => {
        if (err !== null && err !== undefined) {
          reject(err);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

export interface RunBackupOptions {
  environment: string;
  databaseUrl: string;
  backupDsn: string;
  bucket: string;
  retentionDays: number;
}

const parseDsn = (
  dsn: string,
): { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string } => {
  // Format: s3://accessKey:secret@host[:port]/bucket
  const u = new URL(dsn);
  return {
    endpoint: `${u.protocol}//${u.host}`,
    accessKeyId: decodeURIComponent(u.username),
    secretAccessKey: decodeURIComponent(u.password),
    bucket: u.pathname.replace(/^\//, ""),
  };
};

/**
 * Daily backup job. Steps:
 *   1. Run `pg_dump -Fc` against the live database to a temp file.
 *   2. Verify integrity with `pg_restore --list`.
 *   3. Upload to the configured bucket under `gastos-<UTC-date>.dump`.
 *   4. Delete dumps older than `retentionDays`.
 *   5. Write a `BackupRun` row with the final status.
 *
 * Throws on any unrecoverable step; the caller logs the error and
 * updates `lastBackupStatus=failed` via the BackupRun row.
 */
export async function runBackup(opts: RunBackupOptions): Promise<void> {
  const { accessKeyId, secretAccessKey, endpoint } = parseDsn(opts.backupDsn);
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const date = new Date().toISOString().slice(0, 10);
  const key = `gastos-${date}.dump`;
  const tmpFile = `/tmp/${key}`;

  try {
    await execFile(
      "pg_dump",
      ["-Fc", "-f", tmpFile, "--dbname=" + opts.databaseUrl],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    await execFile("pg_restore", ["--list", tmpFile]);

    const body = await readFile(tmpFile);
    await client.send(new PutObjectCommand({ Bucket: opts.bucket, Key: key, Body: body }));

    await pruneOldBackups(client, opts.bucket, opts.retentionDays);

    await prisma.backupRun.create({
      data: {
        status: "ok",
        bytes: body.byteLength,
        storageKey: key,
        environment: opts.environment,
      },
    });
  } catch (err) {
    await prisma.backupRun.create({
      data: {
        status: "failed",
        environment: opts.environment,
        message: String(err instanceof Error ? err.message : err),
      },
    });
    throw err;
  } finally {
    await unlink(tmpFile).catch(() => undefined);
  }
}

async function pruneOldBackups(
  client: S3Client,
  bucket: string,
  retentionDays: number,
): Promise<void> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const list = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
  for (const obj of list.Contents ?? []) {
    if (obj.Key === undefined || obj.LastModified === undefined) continue;
    if (obj.LastModified.getTime() < cutoff) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
    }
  }
}