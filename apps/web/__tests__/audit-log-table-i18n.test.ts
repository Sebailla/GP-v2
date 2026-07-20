import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TDD contract — M5 5.5 RED → 5.6 GREEN.
 *
 * Per `openspec/changes/module-5-production-hardening/design.md` D7
 * + tasks.md 5.5/5.6 + `openspec/specs/audit-log-ui/spec.md`:
 *
 *   The `ipAddress` column on `AdminAuditEvent` stores the
 *   HMAC-SHA256 hex digest of the admin's IP (per `hashIpForAudit`
 *   in `audit.service.ts`). The audit table column header in the
 *   admin UI was labelled "IP (hash, first 8 chars)" /
 *   "IP (hash, primeros 8 chars)" — both generic "hash" labels
 *   that mislead operators about the cryptographic construction.
 *
 *   M5 D7 mandates renaming the header to:
 *     - English: "IP (HMAC, first 8 chars)"
 *     - Spanish: "IP (HMAC, primeros 8 caracteres)"
 *
 *   Both labels are operator-facing and appear in
 *   `apps/web/messages/{en,es}.json` under
 *   `admin.audit.columns.ipAddress`.
 *
 * What this test pins (per tasks.md 5.5):
 *   1. `apps/web/messages/en.json` contains exactly
 *      "IP (HMAC, first 8 chars)" under
 *      `admin.audit.columns.ipAddress`.
 *   2. `apps/web/messages/es.json` contains exactly
 *      "IP (HMAC, primeros 8 caracteres)" under
 *      `admin.audit.columns.ipAddress`.
 *
 * The HMAC wording matches the actual HMAC-SHA256 construction the
 * codebase ships (`hashIpForAudit` → `createHmac("sha256", ...)`),
 * so the UI label and the storage implementation agree.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MESSAGES_DIR = path.resolve(__dirname, "../messages");

const EN_PATH = path.join(MESSAGES_DIR, "en.json");
const ES_PATH = path.join(MESSAGES_DIR, "es.json");

interface AuditMessages {
  readonly admin: {
    readonly audit: {
      readonly columns: {
        readonly ipAddress: string;
      };
    };
  };
}

/**
 * Read the i18n catalog and walk to `admin.audit.columns.ipAddress`.
 * Returns the resolved label string.
 */
function readIpAddressLabel(filePath: string): string {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as AuditMessages;
  return parsed.admin.audit.columns.ipAddress;
}

describe("AuditLogTable i18n HMAC label (M5 5.5 RED)", () => {
  it("apps/web/messages/en.json → 'IP (HMAC, first 8 chars)'", () => {
    const label = readIpAddressLabel(EN_PATH);
    expect(label).toBe("IP (HMAC, first 8 chars)");
    // Triangulation: the OLD 'hash' label MUST NOT remain — a UI that
    // accidentally shipped both labels would confuse operators about
    // the cryptographic construction.
    expect(label).not.toContain("hash");
  });

  it("apps/web/messages/es.json → 'IP (HMAC, primeros 8 caracteres)'", () => {
    const label = readIpAddressLabel(ES_PATH);
    expect(label).toBe("IP (HMAC, primeros 8 caracteres)");
    // Triangulation: the OLD 'hash' label MUST NOT remain.
    expect(label).not.toContain("hash");
  });
});
