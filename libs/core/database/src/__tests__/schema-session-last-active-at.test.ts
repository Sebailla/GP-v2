import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TDD contract for the `Session.lastActiveAt` column + index additions to
 * `libs/core/database/prisma/schema.prisma` (module-4-privacy — task 1.1 RED).
 *
 * Per `openspec/changes/module-4-privacy/design.md` §4 (File Changes —
 * Phase 1 group) + §2 (D1) + §2 (D7), the Session model MUST grow:
 *  - `lastActiveAt DateTime?` — nullable so the column is additive
 *    (no backfill); pre-existing session rows remain readable.
 *  - `@@index([lastActiveAt])` — keeps the `list()` ORDER BY
 *    `lastActiveAt DESC` and the coalesce-update WHERE clause off a
 *    seq-scan path.
 *
 * The corresponding Prisma migration MUST be generated as
 * `<ts>_add_session_last_active_at/migration.sql` per task 1.2 GREEN.
 *
 * Why a static-file test instead of a Prisma-runtime migration test:
 * mirrors the M3 pattern in `schema-admin-audit.test.ts`. The repo
 * uses a lazy Prisma proxy (`libs/core/database/src/client.ts`) and
 * a real Postgres connection is not available in CI for
 * `@core/database` (the only DB-touching test there mocks `prisma`).
 * The test therefore asserts the schema source + migration SQL
 * directly — both are the single source of truth, both are checked
 * into git, and both are reproducible in CI without a running DB.
 *
 * RED state (pre-1.2 GREEN): `lastActiveAt` does NOT exist in
 * `schema.prisma`, the migration folder does NOT exist, so every
 * assertion fails for the expected "feature missing" reason.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..", "..");
const SCHEMA_PATH = resolve(PACKAGE_ROOT, "prisma/schema.prisma");
const MIGRATIONS_DIR = resolve(PACKAGE_ROOT, "prisma/migrations");

describe("Session.lastActiveAt + index schema additions (M4 task 1.1)", () => {
  describe("schema.prisma declarations", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf8");

    it("declares lastActiveAt as a nullable DateTime on the Session model", () => {
      // Per design D1 — the column is nullable because every existing
      // session row predates it; we MUST NOT require a backfill at
      // migration time. The TS view of this column comes from the
      // generated client (`Session.lastActiveAt: Date | null`), so the
      // SQL type MUST be `TIMESTAMP(3)` (NULL-able by default in
      // Prisma because of the trailing `?`).
      expect(schema).toMatch(
        /model\s+Session\s+\{[\s\S]*?lastActiveAt\s+DateTime\?/,
      );
    });

    it("declares @@index([lastActiveAt]) for the list ORDER BY + coalesce UPDATE", () => {
      // Per design D1 + D7: `list()` orders by `lastActiveAt DESC` and
      // `validateSession` updates with
      //   `where: { id, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] }`
      // Both paths benefit from an index on `lastActiveAt`.
      expect(schema).toMatch(
        /model\s+Session\s+\{[\s\S]*?@@index\(\[lastActiveAt\]\)/,
      );
    });
  });

  describe("Prisma migration directory", () => {
    // The migration folder MUST exist with the conventional name
    // `<ts>_add_session_last_active_at` and MUST contain `migration.sql`
    // that adds the column + index.
    it("contains a migration folder whose name ends with `_add_session_last_active_at`", () => {
      const entries = readdirSync(MIGRATIONS_DIR);
      const match = entries.find((name) =>
        name.endsWith("_add_session_last_active_at"),
      );
      expect(
        match,
        `migration folder missing under ${MIGRATIONS_DIR}`,
      ).toBeDefined();
    });

    it("the migration SQL adds the nullable lastActiveAt TIMESTAMP(3) column to sessions", () => {
      const entries = readdirSync(MIGRATIONS_DIR);
      const folder = entries.find((name) =>
        name.endsWith("_add_session_last_active_at"),
      );
      if (!folder) {
        expect.fail("migration folder missing — cannot read migration.sql");
      }
      const sql = readFileSync(
        resolve(MIGRATIONS_DIR, folder, "migration.sql"),
        "utf8",
      );
      // Prisma emits `ALTER TABLE "sessions" ADD COLUMN "lastActiveAt" TIMESTAMP(3)`
      // for nullable DateTime columns (no NOT NULL constraint). Pin the
      // operation name + table + column name + type so the migration is
      // unambiguous in code review.
      expect(sql).toMatch(
        /ALTER TABLE\s+"sessions"\s+ADD COLUMN\s+"lastActiveAt"\s+TIMESTAMP\(3\)/,
      );
      // The column is nullable: no NOT NULL constraint on the ADD COLUMN.
      expect(sql).not.toMatch(
        /ADD COLUMN\s+"lastActiveAt"\s+TIMESTAMP\(3\)\s+NOT NULL/,
      );
    });

    it("the migration SQL creates the sessions_lastActiveAt_idx index", () => {
      const entries = readdirSync(MIGRATIONS_DIR);
      const folder = entries.find((name) =>
        name.endsWith("_add_session_last_active_at"),
      );
      if (!folder) {
        expect.fail("migration folder missing — cannot read migration.sql");
      }
      const sql = readFileSync(
        resolve(MIGRATIONS_DIR, folder, "migration.sql"),
        "utf8",
      );
      // Prisma names the index from the model + column: `sessions_lastActiveAt_idx`.
      // Pin the exact CREATE INDEX statement so a future refactor that
      // renames the index fails CI before production deploy.
      expect(sql).toMatch(
        /CREATE INDEX\s+"sessions_lastActiveAt_idx"/,
      );
    });
  });
});
