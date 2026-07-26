import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * M5.1 task 1.1 RED — coverage-validator process-exit contract.
 *
 * The validator (tools/coverage-validator.ts) walks each workspace's
 * `coverage/coverage-summary.json`, compares lines/branches/functions/
 * statements against the 60% threshold, and exits non-zero when ANY
 * package falls below the threshold. The contract follows the
 * observability spec's "Coverage Threshold Process Enforcement (M5.1)"
 * scenario "One package forced below 60% — coverage run fails".
 *
 * RED → GREEN strategy:
 *   - 1.1 RED: pin the contract via this test. The test loads the
 *     module under test, seeds two `coverage-summary.json` files
 *     (one passing, one failing), points the workspace resolver at
 *     the seeded directories, and asserts the exit code + stdout.
 *     Until `tools/coverage-validator.ts` exists, the dynamic import
 *     throws — that IS the RED state.
 *   - 1.2 GREEN: implement the validator (parses JSON, returns 0/1,
 *     emits a report listing the failing packages).
 *   - 1.5 RED: forced-drop scenario (tasks 1.5 below) — single
 *     package at 50% must produce exit 1 with the package named in
 *     the message.
 *   - 1.6 GREEN: turbo.json wires the validator into the pipeline.
 *
 * The test deliberately uses dynamic `import()` so the missing-module
 * RED state is observable (Vitest reports it as a real failure, not
 * a skip).
 */

interface CoverageValidator {
  run(args: {
    workspaceDirs: readonly string[];
    threshold?: number;
    disabled?: boolean;
  }): { code: 0 | 1; stdout: string; stderr: string };
}

const loadValidator = async (): Promise<CoverageValidator> => {
  // Use a `file://` URL so vite/vitest honors the literal filesystem
  // path and resolves the sibling `.ts` file via its transform layer
  // (plain `await import("../coverage-validator")` resolves from the
  // repository root inside vitest's module graph, not from the test
  // file's directory).
  const url = pathToFileURL(join(__dirname, "coverage-validator.ts")).href;
  const mod = (await import(url)) as unknown as {
    default?: CoverageValidator;
  } & CoverageValidator;
  return (mod.default ?? mod) as CoverageValidator;
};

const writeSummary = (
  dir: string,
  total: Record<string, { pct: number }>,
  filename: "coverage-summary.json" | "coverage-final.json" = "coverage-summary.json",
): void => {
  mkdirSync(join(dir, "coverage"), { recursive: true });
  if (filename === "coverage-summary.json") {
    writeFileSync(
      join(dir, "coverage", "coverage-summary.json"),
      JSON.stringify({ total }),
    );
  } else {
    // coverage-final.json is the v8 raw per-file trace; the
    // validator only accepts it when the file ALSO carries the
    // aggregate `total` block (which real vitest output never
    // does — but Vitest 4.x's per-package emit still drops a
    // separate coverage-final.json with per-file slices). For
    // the test we seed it WITH a `total` block to exercise the
    // dual-format path the validator accepts.
    writeFileSync(
      join(dir, "coverage", "coverage-final.json"),
      JSON.stringify({
        "/some/file.ts": { s: { 1: 1 }, b: { 1: 1 }, f: { 1: 1 } },
        total,
      }),
    );
  }
};

describe("coverage-validator", () => {
  let tmpRoot: string;
  let passingDir: string;
  let failingDir: string;
  let emptyDir: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "coverage-validator-"));
    passingDir = join(tmpRoot, "apps-pkg-pass");
    failingDir = join(tmpRoot, "apps-pkg-fail");
    emptyDir = join(tmpRoot, "apps-pkg-empty");
    writeSummary(passingDir, {
      lines: { pct: 75 },
      branches: { pct: 70 },
      functions: { pct: 80 },
      statements: { pct: 75 },
    });
    writeSummary(failingDir, {
      lines: { pct: 50 },
      branches: { pct: 65 },
      functions: { pct: 70 },
      statements: { pct: 55 },
    });
    mkdirSync(join(emptyDir, "coverage"), { recursive: true });
    writeFileSync(
      join(emptyDir, "coverage", "coverage-summary.json"),
      "{ this is not valid json",
    );
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("exits 0 when every package's coverage is at or above the threshold (60%)", async () => {
    const validator = await loadValidator();
    const result = validator.run({ workspaceDirs: [passingDir] });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("exits 1 when any package's coverage is below the threshold (60%)", async () => {
    const validator = await loadValidator();
    const result = validator.run({ workspaceDirs: [passingDir, failingDir] });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("apps-pkg-fail");
    expect(result.stderr).toMatch(/(?<!\d)(?:[4-5][0-9](?:\.\d+)?)(?!\d)/);
  });

  it("exits 1 when a summary file is malformed (cannot parse JSON)", async () => {
    const validator = await loadValidator();
    const result = validator.run({ workspaceDirs: [emptyDir] });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("apps-pkg-empty");
  });

  it("exits 1 when a workspace is missing its coverage summary", async () => {
    const missingDir = mkdtempSync(join(tmpRoot, "apps-pkg-missing-"));
    const validator = await loadValidator();
    const result = validator.run({ workspaceDirs: [missingDir] });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("apps-pkg-missing-");
    expect(result.stderr).toMatch(/missing/i);
    expect(result.stdout).not.toContain("PASS");
  });

  /**
   * M5.1 task 1.5 — forced-drop scenario, the literal spec contract.
   * A single workspace package forced to 50% lines coverage MUST exit
   * non-zero with a stderr message that names the failing package and
   * its measured percentage (observability spec scenario "One package
   * forced below 60% — coverage run fails").
   */
  it("exits 1 with the failing package name AND its measured percentage in stderr (1.5 forced-drop)", async () => {
    const validator = await loadValidator();
    const result = validator.run({ workspaceDirs: [failingDir] });
    expect(result.code).toBe(1);
    // The exact failing-package name must appear in the error stream
    // so operators can read the CI log and locate the offender.
    expect(result.stderr).toContain("apps-pkg-fail");
    // The 50.00% percentage (the line value just below threshold) must
    // appear so operators can verify how far the package dropped.
    expect(result.stderr).toMatch(/50(?:\.0+)?/);
    // At least one failing metric label must be named on stderr so the
    // report identifies which dimension failed.
    expect(result.stderr).toMatch(/lines/);
  });

  it("exits 0 with a warning when coverage.disabled=true even if a package is below threshold", async () => {
    const validator = await loadValidator();
    const result = validator.run({
      workspaceDirs: [passingDir, failingDir],
      disabled: true,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/WARN|disabled/i);
  });

  it("accepts coverage-final.json (v8 raw) when it carries the 'total' block (Vitest 4.x emits this)", async () => {
    const dualFormatDir = join(tmpRoot, "apps-pkg-final-json");
    writeSummary(
      dualFormatDir,
      {
        lines: { pct: 75 },
        branches: { pct: 75 },
        functions: { pct: 75 },
        statements: { pct: 75 },
      },
      "coverage-final.json",
    );
    const validator = await loadValidator();
    const result = validator.run({ workspaceDirs: [dualFormatDir] });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("apps-pkg-final-json");
  });
});

/**
 * Sanity check: vi is loaded so the test file stays
 * useful when the validator grows to need fake-timers or
 * module mocking in later tasks (1.5, 1.6).
 */
describe("coverage-validator harness", () => {
  it("loads vi for future forced-stub support (1.5)", () => {
    expect(typeof vi.fn).toBe("function");
  });
});

/**
 * M5.1 task 1.3 RED → 1.4 GREEN — Vitest 4.2+ upgrade contract.
 *
 * The design (D1) and the proposal both call for a Vitest 4.2+ bump
 * to leverage the v4.2 threshold-vs-exit fix. The PR-#1 task 1.3
 * explicitly says: "bump Vitest to v4.2.5; if all 6 packages' vitest
 * suites still pass, keep v4.2.5; if not, fall back to v4.1.9 + custom
 * comparator".
 *
 * RED reality check: as of the M5.1 planning date (2026-07-26) the
 * npm `vitest` latest stable is `4.1.10` (verified via
 * `npm view vitest dist-tags`); the 4.2 line was never published.
 * Attempting the bump is impossible.
 *
 * The chosen path (D1 + D3): keep the workspace on Vitest 4.1.x and
 * rely on the comparator (this validator) as the deterministic gate.
 * This test pins the fallback so a future contributor is forced to
 * revisit the comparator decision before bumping to a 5.x release.
 */
describe("Vitest version selection (M5.1 task 1.3 RED)", () => {
  it("keeps Vitest pinned to 4.1.x — the custom comparator enforces 60% (1.3 fallback)", () => {
    const root = readRootPackageJson();
    expect(root.devDependencies?.vitest).toMatch(/^4\.1\./);
    expect(root.devDependencies?.["@vitest/coverage-v8"]).toMatch(/^4\.1\./);
  });

  it("all six covered workspaces pin Vitest to 4.1.x (1.4 consistent state)", () => {
    const coveredWorkspaces = [
      "apps/api",
      "apps/web",
      "libs/features/auth/server",
      "libs/core/database",
      "libs/core/logging",
      "libs/core/rate-limit",
    ] as const;
    for (const ws of coveredWorkspaces) {
      const pkg = readWorkspacePackageJson(ws);
      expect(pkg.devDependencies?.vitest).toMatch(/^4\.1\./);
    }
  });

  it("every covered workspace still wires coverage.thresholds.global at 60% per metric (1.4 GREEN)", () => {
    const coveredWorkspaces = [
      "apps/api",
      "apps/web",
      "libs/features/auth/server",
      "libs/core/database",
      "libs/core/logging",
      "libs/core/rate-limit",
    ] as const;
    for (const ws of coveredWorkspaces) {
      const src = readWorkspaceVitestConfig(ws);
      expect(src, `${ws}/vitest.config.ts must exist`).toBeTypeOf("string");
      // The threshold keys must appear with the literal value 60 on every metric.
      expect(src).toMatch(/lines:\s*60/);
      expect(src).toMatch(/branches:\s*60/);
      expect(src).toMatch(/functions:\s*60/);
      expect(src).toMatch(/statements:\s*60/);
    }
  });
});

const readRootPackageJson = (): {
  devDependencies?: Record<string, string>;
} => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const pkgPath = path.join(__dirname, "..", "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
};

const readWorkspacePackageJson = (workspace: string): {
  devDependencies?: Record<string, string>;
} => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const pkgPath = path.join(__dirname, "..", workspace, "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
};

const readWorkspaceVitestConfig = (workspace: string): string => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const cfgPath = path.join(__dirname, "..", workspace, "vitest.config.ts");
  return fs.readFileSync(cfgPath, "utf8");
};
