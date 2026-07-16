import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  send: vi.fn().mockResolvedValue({ Contents: [] }),
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("test-bytes")),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.send;
  },
  PutObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  ListObjectsV2Command: class {
    constructor(public readonly input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));

const dbMocks = vi.hoisted(() => ({
  backupRunCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@core/database", () => ({
  prisma: {
    backupRun: { create: dbMocks.backupRunCreate },
  },
}));

import { prisma } from "@core/database";
import { runBackup } from "../backup";

/**
 * Default execFile mock: succeed on every invocation. The
 * `(err, stdout, stderr)` callback signature matches Node's
 * documented API so production code can use the callback form.
 */
function successExecFile(
  _file: string,
  _args: ReadonlyArray<string>,
  _options: unknown,
  cb: (err: null, stdout: string, stderr: string) => void,
): void {
  cb(null, "--", "");
}

describe("runBackup", () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
    mocks.execFile.mockImplementation(successExecFile);
    mocks.send.mockClear();
    dbMocks.backupRunCreate.mockClear();
  });

  it("invokes pg_dump, verifies integrity, uploads to R2, and writes BackupRun", async () => {
    await runBackup({
      environment: "test",
      databaseUrl: "postgresql://localhost/db",
      backupDsn: "s3://key:secret@bucket",
      bucket: "bucket",
      retentionDays: 7,
    });

    // pg_dump AND pg_restore --list both go through execFile; the second
    // call would otherwise attempt to run the real pg_restore binary on
    // /tmp/gastos-<date>.dump and crash the test.
    const calls = mocks.execFile.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]?.[0]).toBe("pg_dump");
    expect(calls[1]?.[0]).toBe("pg_restore");
    expect(mocks.execFile).toHaveBeenCalledWith(
      "pg_dump",
      expect.any(Array),
      expect.objectContaining({ maxBuffer: expect.any(Number) }),
      expect.any(Function),
    );
    expect(mocks.execFile).toHaveBeenCalledWith(
      "pg_restore",
      ["--list", expect.any(String)],
      expect.any(Object),
      expect.any(Function),
    );
    expect(mocks.send).toHaveBeenCalled();
    expect(prisma.backupRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ok",
          environment: "test",
        }),
      }),
    );
  });

  it("writes a failed BackupRun row and rethrows when pg_dump fails", async () => {
    mocks.execFile.mockImplementationOnce(
      (
        _file: string,
        _args: ReadonlyArray<string>,
        _options: unknown,
        cb: (err: Error) => void,
      ): void => {
        cb(new Error("pg_dump crashed"));
      },
    );

    await expect(
      runBackup({
        environment: "test",
        databaseUrl: "postgresql://localhost/db",
        backupDsn: "s3://key:secret@bucket",
        bucket: "bucket",
        retentionDays: 7,
      }),
    ).rejects.toThrow("pg_dump crashed");

    expect(prisma.backupRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          environment: "test",
          message: expect.stringContaining("pg_dump crashed"),
        }),
      }),
    );
  });
});