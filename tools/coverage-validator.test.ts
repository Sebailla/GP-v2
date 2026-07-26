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

const writeSummary = (dir: string, total: Record<string, { pct: number }>): void => {
  mkdirSync(join(dir, "coverage"), { recursive: true });
  writeFileSync(
    join(dir, "coverage", "coverage-summary.json"),
    JSON.stringify({ total }),
  );
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
