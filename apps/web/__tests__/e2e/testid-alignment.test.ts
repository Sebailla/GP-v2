import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TDD contract for the e2e `<->` component testid alignment
 * (JD-5 fix — JD-driven correction round 1).
 *
 * The Playwright e2e at `apps/web/e2e/auth/audit.spec.ts`
 * referenced `getByTestId('audit-table-row')`,
 * `getByTestId('purge-dry-run-success')`, and
 * `getByTestId('purge-real-success')`. The actual components in
 * `apps/web/components/admin/` use different testids
 * (`retention-dry-run-result`, `retention-purge-result`, etc.),
 * so the spec was guaranteed to fail when executed against a
 * live DOM.
 *
 * The fix per the JD-5 brief: align the testids to a canonical
 * naming convention used by BOTH the spec and the component. We
 * chose to update the components (where they didn't already have
 * a sensible testid — e.g., `audit-table-row` was added to
 * AuditLogTable) AND the spec (to use the
 * `retention-dry-run-result` / `retention-purge-result` testids
 * the AuditRetentionButton already exposes).
 *
 * This static contract pulls every `getByTestId('...')` from the
 * spec and asserts each testid is present on at least one
 * component in `apps/web/components/admin/`. RED before the fix
 * — the spec referenced three unreachable testids. GREEN after
 * the fix — every spec testid has a matching component.
 */

// vitest's `import.meta.url` resolution under pnpm/vite can land
// at an unexpected prefix (e.g., `/@fs/...`). Anchor all relative
// paths from process.cwd(), which is the workspace package root
// (`apps/web/`) when this test runs via `pnpm --filter web test`.
const PKG_ROOT = process.cwd();
const SPEC_PATH = resolve(PKG_ROOT, "e2e/auth/audit.spec.ts");

const COMPONENT_PATHS = [
  resolve(PKG_ROOT, "components/admin/AuditFilterBar.tsx"),
  resolve(PKG_ROOT, "components/admin/AuditLogTable.tsx"),
  resolve(PKG_ROOT, "components/admin/AuditRetentionButton.tsx"),
  // AdminNav.tsx is mounted by the audit page too — include it
  // for completeness (no audit-testids live there today, but
  // future testids must be visible to the contract).
  resolve(PKG_ROOT, "components/admin/AdminNav.tsx"),
];

function readSource(): {
  spec: string;
  components: Record<string, string>;
} {
  const spec = readFileSync(SPEC_PATH, "utf8");
  const components: Record<string, string> = {};
  for (const path of COMPONENT_PATHS) {
    components[path] = readFileSync(path, "utf8");
  }
  return { spec, components };
}

function extractSpecTestIds(spec: string): string[] {
  const matches = spec.matchAll(/getByTestId\(\s*["']([^"']+)["']\s*\)/g);
  return [...matches].map((m) => m[1] as string);
}

function componentHasTestId(
  components: Record<string, string>,
  testId: string,
): boolean {
  // Escape for regex (testids are stable strings of [a-zA-Z0-9-_]).
  for (const source of Object.values(components)) {
    if (source.includes(`data-testid="${testId}"`)) return true;
    if (source.includes(`data-testid='${testId}'`)) return true;
  }
  return false;
}

describe("JD-5 — e2e spec testids ↔ component testids alignment", () => {
  it("every getByTestId('...') in audit.spec.ts points to a data-testid mounted by the components", () => {
    const { spec, components } = readSource();
    const testIds = extractSpecTestIds(spec);

    // Sanity: the spec should have at least the testids the JD-5
    // brief flagged. If the spec is rewritten without any
    // testids, the static check is a no-op — the contract that
    // catches the misalignment is "at least N testids, all of
    // which resolve to components".
    expect(testIds.length).toBeGreaterThanOrEqual(3);

    for (const testId of testIds) {
      expect(componentHasTestId(components, testId)).toBe(true);
    }
  });
});
