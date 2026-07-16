/**
 * scripts/operations/__tests__/backup-e2e.test.ts
 *
 * End-to-end test for the backup script (R-PF-7). Runs `pg_dump` and
 * `pg_restore --list` against a real Postgres instance. The test is
 * SKIPPED if the env var `BACKUP_E2E_DATABASE_URL` is not set.
 *
 * To run locally:
 *   docker run --rm -d -p 5433:5432 -e POSTGRES_USER=postgres \
 *     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
 *     --name gpr-backup postgres:16-alpine
 *   BACKUP_E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres \
 *     pnpm --filter scripts exec vitest run backup-e2e
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFileCb);

const DATABASE_URL = process.env["BACKUP_E2E_DATABASE_URL"];
const describeMaybe = DATABASE_URL ? describe : describe.skip;

describeMaybe("backup + restore drill (R-PF-7 e2e)", () => {
  const tmpDir = path.join("/tmp", "gpr-backup-e2e");
  const dumpFile = path.join(tmpDir, "gastos.dump");

  beforeAll(async () => {
    if (!DATABASE_URL) return;
    await mkdir(tmpDir, { recursive: true });
    // Seed a known row so the restore drill has something to verify.
    const { Client } = await import("pg");
    const adminUrl = DATABASE_URL.replace(/\/[^/]+$/, "/postgres");
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE gastos_target;`).catch(() => undefined);
    await admin.end();

    const target = new Client({ connectionString: DATABASE_URL.replace(/\/[^/]+$/, "/gastos_target") });
    await target.connect();
    // Minimal schema mirroring the production slices (auth + transactions).
    // The restore drill must assert counts on User, Transaction, and
    // Category per the R-PF-7 contract — see Q-PF-D in the spec.
    await target.query(`
      CREATE TABLE IF NOT EXISTS "User" (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "Category" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "Transaction" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "categoryId" TEXT NOT NULL,
        amount TEXT NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await target.query(
      `INSERT INTO "User" (id, email) VALUES ('e2e-user-1', 'e2e@example.com') ON CONFLICT DO NOTHING;`,
    );
    await target.query(
      `INSERT INTO "Category" (id, name) VALUES ('e2e-cat-1', 'e2e-category') ON CONFLICT DO NOTHING;`,
    );
    await target.query(
      `INSERT INTO "Transaction" (id, "userId", "categoryId", amount) VALUES ('e2e-tx-1', 'e2e-user-1', 'e2e-cat-1', '100.00') ON CONFLICT DO NOTHING;`,
    );
    await target.end();
  });

  afterAll(async () => {
    if (!DATABASE_URL) return;
    await unlink(dumpFile).catch(() => undefined);
    const { Client } = await import("pg");
    const admin = new Client({ connectionString: DATABASE_URL.replace(/\/[^/]+$/, "/postgres") });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS gastos_target;`).catch(() => undefined);
    await admin.end();
  });

  it("pg_dump -Fc produces a dump that pg_restore --list accepts", async () => {
    const targetUrl = DATABASE_URL!.replace(/\/[^/]+$/, "/gastos_target");
    await execFileAsync("pg_dump", ["-Fc", "-f", dumpFile, "--dbname=" + targetUrl]);
    const { stdout } = await execFileAsync("pg_restore", ["--list", dumpFile]);
    // The custom User table must appear in the TOC.
    expect(stdout).toContain("User");
  }, 30_000);

  it("restore into isolated DB produces matching row count", async () => {
    const targetUrl = DATABASE_URL!.replace(/\/[^/]+$/, "/gastos_target");
    const isolatedName = `gastos_drill_${Date.now()}`;
    const isolatedUrl = DATABASE_URL!.replace(/\/[^/]+$/, `/${isolatedName}`);
    // `createdb`/`dropdb`/`pg_restore` connect via Unix socket by
    // default; the test Postgres is published on TCP via docker.
    // Parse the connection URL and pass --host/--port explicitly so
    // the helpers reach the test instance.
    const parsed = new URL(DATABASE_URL!.replace(/^postgresql:\/\//, "http://"));
    const host = parsed.hostname;
    const port = parsed.port || "5432";
    const user = parsed.username;
    const password = decodeURIComponent(parsed.password);
    const pgEnv = {
      ...process.env,
      PGHOST: host,
      PGPORT: port,
      PGUSER: user,
      PGPASSWORD: password,
    };

    try {
      await execFileAsync("createdb", [isolatedName], { env: pgEnv });
      await execFileAsync(
        "pg_restore",
        ["--clean", "--if-exists", "-h", host, "-p", port, "-U", user, "-d", isolatedUrl, dumpFile],
        { env: pgEnv },
      );
      const { Client } = await import("pg");
      const iso = new Client({ connectionString: isolatedUrl });
      await iso.connect();
      // R-PF-7 / Q-PF-D: assert row counts for User, Category, and
      // Transaction (the three core tables in the auth + transactions
      // slices). Production dumps may be empty for some slices; the
      // minimum assertion is `>= 0` to prove pg_restore wired the
      // tables without errors.
      const counts = await iso.query<{ table_name: string; n: number }>(
        `SELECT 'User' AS table_name, COUNT(*)::int AS n FROM "User"
         UNION ALL SELECT 'Category', COUNT(*)::int FROM "Category"
         UNION ALL SELECT 'Transaction', COUNT(*)::int FROM "Transaction"`,
      );
      await iso.end();
      const byTable = new Map(counts.rows.map((r) => [r.table_name, r.n]));
      expect(byTable.get("User")).toBeGreaterThanOrEqual(1);
      expect(byTable.get("Category")).toBeGreaterThanOrEqual(1);
      expect(byTable.get("Transaction")).toBeGreaterThanOrEqual(1);
    } finally {
      await execFileAsync("dropdb", ["--if-exists", "-h", host, "-p", port, "-U", user, isolatedName], {
        env: pgEnv,
      }).catch(() => undefined);
    }
  }, 30_000);
});
