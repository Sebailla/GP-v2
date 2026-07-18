import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TDD contract for the AdminAuditEvent + Session.metadata additions to
 * `libs/core/database/prisma/schema.prisma` (module-3-superadmin — task 1.1 RED).
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §4
 * (File Changes — phase 1 group), the schema MUST grow:
 *  - `AdminAuditEvent` model with the 7 audit columns.
 *  - `Session.metadata Json?` column.
 *
 * The corresponding Prisma migration MUST be generated as
 * `<ts>_add_admin_audit_event/migration.sql` per task 1.2 GREEN.
 *
 * Why a static-file test instead of a Prisma-runtime migration test:
 * the project uses a lazy Prisma proxy (`libs/core/database/src/client.ts`)
 * and a real Postgres connection is not available in CI for `@core/database`
 * (the only DB-touching test there mocks `prisma`). The test therefore
 * asserts the schema source + migration SQL directly — both are the
 * single source of truth, both are checked into git, and both are
 * reproducible in CI without a running DB.
 *
 * RED state (pre-1.2 GREEN): `AdminAuditEvent` does NOT exist in
 * `schema.prisma`, the migration folder does NOT exist, so every
 * assertion fails for the expected "feature missing" reason.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..", "..");
const SCHEMA_PATH = resolve(PACKAGE_ROOT, "prisma/schema.prisma");
const MIGRATIONS_DIR = resolve(PACKAGE_ROOT, "prisma/migrations");
const GENERATED_MODELS_INDEX = resolve(PACKAGE_ROOT, "src/generated/models.ts");

describe("AdminAuditEvent + Session.metadata schema additions (M3 task 1.1)", () => {
  describe("schema.prisma declarations", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf8");

    it("declares the AdminAuditEvent model", () => {
      // Per design.md §4 + spec `rbac-admin` "Admin Audit Event Storage"
      // requirement: every admin operation MUST persist to `AdminAuditEvent`
      // with `actorId`, `targetId`, `action`, `createdAt`, `metadata`,
      // `ipAddress`, `userAgent`. The model declaration is the single
      // source of truth; this test pins its existence + the column names
      // so an accidental rename during a later refactor fails CI before
      // the migration drifts.
      expect(schema).toMatch(/^model\s+AdminAuditEvent\s+\{/m);
    });

    it("declares actorId column on AdminAuditEvent", () => {
      expect(schema).toMatch(/model\s+AdminAuditEvent\s+\{[\s\S]*?actorId\s+String\b/);
    });

    it("declares targetId column on AdminAuditEvent", () => {
      expect(schema).toMatch(/model\s+AdminAuditEvent\s+\{[\s\S]*?targetId\s+String\b/);
    });

    it("declares metadata column as Json on AdminAuditEvent", () => {
      expect(schema).toMatch(
        /model\s+AdminAuditEvent\s+\{[\s\S]*?metadata\s+Json\b/,
      );
    });

    it("declares ipAddress column sized for a full HMAC-SHA256 hex digest", () => {
      expect(schema).toMatch(
        /model\s+AdminAuditEvent\s+\{[\s\S]*?ipAddress\s+String\?[\s\S]*?@db\.VarChar\(64\)/,
      );
    });

    it("declares userAgent column with length cap on AdminAuditEvent", () => {
      // Design §4 / threat matrix §7 — UA truncated to 512 chars at the
      // controller boundary. The DB column is sized to match.
      expect(schema).toMatch(
        /model\s+AdminAuditEvent\s+\{[\s\S]*?userAgent\s+String\?[\s\S]*?@db\.VarChar\(512\)/,
      );
    });

    it("declares @@index([createdAt]) for the retention cron", () => {
      // D7 — purge job lands in M4; the index is required for the eventual
      // purge query and ships in M3 to keep the table usable.
      expect(schema).toMatch(/model\s+AdminAuditEvent\s+\{[\s\S]*?@@index\(\[createdAt\]/);
    });

    it("adds `metadata Json?` to the Session model", () => {
      // Per design.md §4 — the Session table grows a free-form
      // `metadata` JSON column. The `?` is non-negotiable: every existing
      // session row predates the column and must remain readable.
      expect(schema).toMatch(/model\s+Session\s+\{[\s\S]*?metadata\s+Json\?/);
    });
  });

  describe("generated Prisma client surface", () => {
    // The generated client (`prisma generate`) MUST expose
    // `prisma.adminAuditEvent` as a delegate. This is the runtime
    // assertion the GREEN step actually unblocks — without the
    // generated model, every Prisma call in RbacService.changeRole
    // / SessionService.revoke would fail at type-check time.
    //
    // We assert two things:
    //   1. The generated models barrel re-exports `AdminAuditEvent`
    //      types (pinning the type-level surface).
    //   2. The generated `PrismaClient` class exposes the
    //      `adminAuditEvent` delegate (pinning the runtime surface
    //      that `prisma.adminAuditEvent.create(...)` reads from).
    it("re-exports AdminAuditEvent from the generated models barrel", () => {
      const source = readFileSync(GENERATED_MODELS_INDEX, "utf8");
      expect(source).toMatch(/export type \* from ['"]\.\/models\/AdminAuditEvent['"]/);
    });

    it("declares the adminAuditEvent delegate on PrismaClient", () => {
      // The generated client (`src/generated/internal/class.ts`) declares
      // the delegate as a getter; checking the source pins the surface
      // without forcing a real DB connection at unit-test time.
      const classSource = readFileSync(
        resolve(PACKAGE_ROOT, "src/generated/internal/class.ts"),
        "utf8",
      );
      expect(classSource).toMatch(/get\s+adminAuditEvent\s*\(\s*\)/);
    });
  });

  describe("Prisma migration directory", () => {
    // The migration folder MUST exist with the conventional name
    // `<ts>_add_admin_audit_event` and MUST contain `migration.sql`
    // that creates the table + the metadata column.
    it("contains a migration folder whose name ends with `_add_admin_audit_event`", () => {
      const entries = readdirSync(MIGRATIONS_DIR);
      const match = entries.find((name) => name.endsWith("_add_admin_audit_event"));
      expect(match, `migration folder missing under ${MIGRATIONS_DIR}`).toBeDefined();
    });

    it("the migration SQL creates the AdminAuditEvent table with the audit columns", () => {
      const entries = readdirSync(MIGRATIONS_DIR);
      const folder = entries.find((name) => name.endsWith("_add_admin_audit_event"));
      if (!folder) {
        // RED: surface the missing folder cleanly without a TypeError on the
        // subsequent `readFileSync` of an undefined path.
        expect.fail("migration folder missing — cannot read migration.sql");
      }
      const sqlPath = resolve(MIGRATIONS_DIR, folder, "migration.sql");
      expect(existsSync(sqlPath)).toBe(true);
      const sql = readFileSync(sqlPath, "utf8");
      // The migration MUST add the table with every column the audit
      // contract requires — pinning this in CI means a future refactor
      // that drops a column fails before the production deploy.
      //
      // Prisma uses the `@@map` value as the physical table name
      // (`admin_audit_events`) and the model name (`AdminAuditEvent`)
      // for the CREATE TABLE statement. The migration also asserts
      // the actual on-disk types (TEXT, JSONB, VARCHAR) — pinning these
      // catches drift if anyone swaps a column type in a future patch.
      expect(sql).toMatch(/CREATE TABLE\s+"admin_audit_events"/i);
      expect(sql).toMatch(/"actorId"\s+TEXT NOT NULL/);
      expect(sql).toMatch(/"targetId"\s+TEXT NOT NULL/);
      expect(sql).toMatch(/"action"\s+"AdminAuditAction"\s+NOT NULL/);
      expect(sql).toMatch(/"createdAt"\s+TIMESTAMP.*DEFAULT CURRENT_TIMESTAMP/);
      expect(sql).toMatch(/"metadata"\s+JSONB\s+NOT NULL/);
      expect(sql).toMatch(/"ipAddress"\s+VARCHAR\(64\)/);
      expect(sql).toMatch(/"userAgent"\s+VARCHAR\(512\)/);
      expect(sql).toMatch(/CREATE INDEX\s+"admin_audit_events_createdAt_idx"/);
    });

    it("contains a follow-up migration widening ipAddress to VARCHAR(64)", () => {
      const entries = readdirSync(MIGRATIONS_DIR);
      const folder = entries.find((name) => name.endsWith("_widen_admin_audit_ip_hash"));
      expect(folder, `widening migration missing under ${MIGRATIONS_DIR}`).toBeDefined();
      if (!folder) return;
      const sql = readFileSync(resolve(MIGRATIONS_DIR, folder, "migration.sql"), "utf8");
      expect(sql).toMatch(
        /ALTER TABLE\s+"admin_audit_events"\s+ALTER COLUMN\s+"ipAddress"\s+TYPE VARCHAR\(64\)/,
      );
    });

    it("the migration SQL adds the metadata JSONB column to the sessions table", () => {
      const entries = readdirSync(MIGRATIONS_DIR);
      const folder = entries.find((name) => name.endsWith("_add_admin_audit_event"));
      if (!folder) {
        expect.fail("migration folder missing");
      }
      const sql = readFileSync(resolve(MIGRATIONS_DIR, folder, "migration.sql"), "utf8");
      // Prisma emits `ALTER TABLE "sessions" ADD COLUMN "metadata" JSONB`
      // for nullable Json columns. Pin the operation name + table +
      // column name so the migration is unambiguous in code review.
      expect(sql).toMatch(/ALTER TABLE\s+"sessions"\s+ADD COLUMN\s+"metadata"\s+JSONB/);
    });
  });
});