import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TDD contract — M5 5.7 RED → 5.8 GREEN.
 *
 * Per `openspec/changes/module-5-production-hardening/tasks.md` 5.7 +
 * `openspec/specs/observability/spec.md` "Coverage Gate Enforcement"
 * requirement:
 *
 *   - `pnpm turbo run test` MUST enforce per-package coverage
 *     thresholds (lines / branches / functions / statements ≥ 60%).
 *   - A coverage drop below any threshold MUST fail the turbo
 *     `test` task.
 *   - The gate MUST be opt-out via `coverage.disabled=true` env var.
 *   - The opt-out escape MUST be documented in `apps/api/.env.example`
 *     so an operator following the documented escape hatch reaches
 *     the actual escape, not a stale variable name.
 *
 * PR #4 (4.5 RED + 4.6 GREEN) wired the gate end-to-end:
 *   - `apps/api/test/coverage-gate.test.ts` pins the threshold value
 *     + opt-out behavior at the pure-function level.
 *   - 6 per-package `vitest.config.ts` files declare
 *     `thresholds.global.{lines,branches,functions,statements}=60`.
 *   - `turbo.json` `coverage.env` declares `coverage.disabled` so the
 *     opt-out bypass works at the pipeline layer.
 *
 * PR #5 5.7 RED adds the FINAL gate contract:
 *   1. Every package whose vitest config was modified in PR #4 still
 *      declares the four 60% thresholds (regression check — anyone
 *      removing one breaks the gate).
 *   2. `turbo.json` still wires `coverage.disabled` as an env var so
 *      the opt-out path is alive.
 *   3. `coverage.disabled` is documented in `apps/api/.env.example`
 *      with the exact escape semantics — operators reading the docs
 *      reach the live variable name.
 *
 * The pure-function contract (65% pass / 50% fail / opt-out) is
 * pinned in the existing `coverage-gate.test.ts` from PR #4. This
 * file pins the FILE-SYSTEM + CONFIG contract that ties the gate to
 * the actual pipeline so a config drift can't silently disable the
 * coverage requirement.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apps/api/test/coverage-final.test.ts → REPO_ROOT = ../.. (3 up
// from file: test → api → apps → REPO_ROOT)
const REPO_ROOT = path.resolve(__dirname, "../../..");

interface VitestConfigShape {
  coverage?: {
    thresholds?: {
      global?: {
        lines?: number;
        branches?: number;
        functions?: number;
        statements?: number;
      };
    };
  };
}

interface VitestConfigModule {
  default?: { test?: { coverage?: VitestConfigShape["coverage"] }; coverage?: VitestConfigShape["coverage"] };
}

/**
 * Read each per-package vitest config and assert the four 60%
 * thresholds are declared. Regression guard: anyone removing a
 * threshold silently disables the gate — this test fails loud.
 */
const PACKAGE_CONFIGS: ReadonlyArray<{ name: string; relPath: string }> = [
  { name: "apps/api", relPath: "apps/api/vitest.config.ts" },
  { name: "apps/web", relPath: "apps/web/vitest.config.ts" },
  { name: "libs/features/auth/server", relPath: "libs/features/auth/server/vitest.config.ts" },
  { name: "libs/core/database", relPath: "libs/core/database/vitest.config.ts" },
  { name: "libs/core/logging", relPath: "libs/core/logging/vitest.config.ts" },
  { name: "libs/core/rate-limit", relPath: "libs/core/rate-limit/vitest.config.ts" },
];

describe("coverage gate final contract (M5 5.7 RED)", () => {
  it.each(PACKAGE_CONFIGS)(
    "$name declares the four 60% global thresholds (CI fails if dropped)",
    async (pkg) => {
      const absPath = path.join(REPO_ROOT, pkg.relPath);
      expect(existsSync(absPath)).toBe(true);
      // Dynamic import of the live config — vitest config files
      // export `defineConfig({...})`; the default export is the
      // resolved shape. We accept either `config.coverage` or
      // `config.test.coverage` because vitest's typing puts
      // `coverage` under `test` while the runtime accepts both.
      const mod = (await import(absPath)) as VitestConfigModule;
      const config = mod.default ?? {};
      const coverage = config.coverage ?? config.test?.coverage;
      expect(coverage, `${pkg.name} config is missing coverage block`).toBeDefined();
      expect(
        coverage?.thresholds?.global,
        `${pkg.name} config is missing thresholds.global`,
      ).toBeDefined();
      const global = coverage?.thresholds?.global;
      expect(global?.lines, `${pkg.name}.thresholds.global.lines`).toBe(60);
      expect(global?.branches, `${pkg.name}.thresholds.global.branches`).toBe(60);
      expect(global?.functions, `${pkg.name}.thresholds.global.functions`).toBe(60);
      expect(global?.statements, `${pkg.name}.thresholds.global.statements`).toBe(60);
    },
  );

  it("turbo.json wires `coverage.disabled` as a pipeline env var (opt-out escape is live)", () => {
    // Regression guard for PR #4 task 4.6 GREEN: turbo.json's
    // `coverage.env` MUST list `coverage.disabled` so the opt-out
    // escape works at the pipeline layer. Without this env var,
    // turbo's cache hashing would ignore the operator's opt-out and
    // the gate would never be bypassable.
    const turboJsonPath = path.join(REPO_ROOT, "turbo.json");
    const raw = readFileSync(turboJsonPath, "utf8");
    expect(raw).toContain('"coverage"');
    expect(raw).toContain('"coverage.disabled"');
  });

  it("apps/api/.env.example documents the `coverage.disabled` escape", () => {
    // M5 5.8 GREEN contract: the documented opt-out env var name in
    // `.env.example` MUST match the actual turbo pipeline env var.
    // An operator reading the docs MUST reach the live variable
    // name; a rename without a doc update would silently break the
    // escape hatch.
    const envExamplePath = path.join(REPO_ROOT, "apps/api/.env.example");
    expect(existsSync(envExamplePath)).toBe(true);
    const raw = readFileSync(envExamplePath, "utf8");
    expect(raw).toContain("coverage.disabled");
  });
});
