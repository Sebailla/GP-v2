import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * M5.1 task 1.2 GREEN — coverage-validator (post-coverage comparator).
 *
 * Reads every workspace's `coverage/coverage-summary.json` and
 * compares lines / branches / functions / statements against the 60%
 * threshold declared in `openspec/config.yaml` and the observability
 * spec's "Coverage Threshold Process Enforcement (M5.1)" requirement.
 *
 * Behavior (per the §5 contract and the spec scenarios):
 *   - All packages ≥ threshold → exit 0, "PASS" on stdout
 *   - Any package < threshold → exit 1, failing package name + pct on stderr
 *   - Missing summary file → exit 1, missing-package name on stderr
 *   - Malformed JSON summary → exit 1, malformed-package name on stderr
 *   - `disabled: true` (M5 escape hatch via `coverage.disabled=true`)
 *     → exit 0, "WARN: coverage disabled" on stdout
 *
 * D2: JSON is deterministic, per-package, and bypasses Vitest exit
 * quirks on the 4.1.x line. D3: the per-package vitest threshold
 * setting in each `vitest.config.ts` stays live; the validator is the
 * deterministic fallback when Vitest's exit-on-threshold is unreliable.
 *
 * The module exports a pure `run(args)` function (takes pre-discovered
 * workspace dirs + a flag bag) so unit tests can exercise the contract
 * without spawning a child process. The CLI thin wrapper at the bottom
 * invokes the same function with the real workspace discovery.
 */

export type CoverageMetric = "lines" | "branches" | "functions" | "statements";

export interface RunArgs {
  /** Absolute paths to each workspace root (resolves `<root>/coverage/coverage-summary.json`). */
  readonly workspaceDirs: readonly string[];
  /** Fractional threshold (0-100). Defaults to 60. */
  readonly threshold?: number;
  /** When true, all checks emit a WARN line and exit 0 (the M5 escape hatch). */
  readonly disabled?: boolean;
}

export interface RunResult {
  readonly code: 0 | 1;
  readonly stdout: string;
  readonly stderr: string;
}

interface PackageReport {
  readonly dir: string;
  readonly name: string;
  readonly metrics: Readonly<Record<CoverageMetric, number>>;
  readonly status: "pass" | "fail" | "malformed" | "missing";
  readonly failingMetrics: readonly CoverageMetric[];
  readonly error?: string;
}

const DEFAULT_THRESHOLD = 60;
const METRICS: readonly CoverageMetric[] = [
  "lines",
  "branches",
  "functions",
  "statements",
];

const packageNameFor = (absoluteDir: string): string => {
  const parts = absoluteDir.split(/[/\\]/);
  return parts[parts.length - 1] ?? absoluteDir;
};

const parseSummary = (absoluteDir: string): PackageReport => {
  const summaryPath = join(absoluteDir, "coverage", "coverage-summary.json");
  if (!existsSync(summaryPath)) {
    return {
      dir: absoluteDir,
      name: packageNameFor(absoluteDir),
      metrics: { lines: 0, branches: 0, functions: 0, statements: 0 },
      status: "missing",
      failingMetrics: METRICS,
      error: "coverage-summary.json not found",
    };
  }
  const raw = readFileSync(summaryPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return {
      dir: absoluteDir,
      name: packageNameFor(absoluteDir),
      metrics: { lines: 0, branches: 0, functions: 0, statements: 0 },
      status: "malformed",
      failingMetrics: METRICS,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("total" in parsed) ||
    typeof (parsed as { total: unknown }).total !== "object" ||
    (parsed as { total: object }).total === null
  ) {
    return {
      dir: absoluteDir,
      name: packageNameFor(absoluteDir),
      metrics: { lines: 0, branches: 0, functions: 0, statements: 0 },
      status: "malformed",
      failingMetrics: METRICS,
      error: "missing or invalid 'total' object in summary JSON",
    };
  }
  const total = (parsed as { total: Record<string, unknown> }).total;
  const metrics: Record<CoverageMetric, number> = {
    lines: 0,
    branches: 0,
    functions: 0,
    statements: 0,
  };
  for (const metric of METRICS) {
    const entry = total[metric];
    const pct =
      entry !== undefined &&
      entry !== null &&
      typeof entry === "object" &&
      "pct" in entry &&
      typeof (entry as { pct: unknown }).pct === "number"
        ? (entry as { pct: number }).pct
        : 0;
    metrics[metric] = pct;
  }
  return {
    dir: absoluteDir,
    name: packageNameFor(absoluteDir),
    metrics,
    status: "pass",
    failingMetrics: [],
  };
};

const evaluate = (reports: PackageReport[], threshold: number): PackageReport[] =>
  reports.map((report) => {
    if (report.status !== "pass") return report;
    const failingMetrics = METRICS.filter(
      (metric) => report.metrics[metric] < threshold,
    );
    if (failingMetrics.length === 0) return report;
    return { ...report, status: "fail", failingMetrics };
  });

const formatReport = (reports: readonly PackageReport[], threshold: number): string => {
  const lines: string[] = [];
  lines.push(`Coverage threshold: ${threshold}% (lines, branches, functions, statements)`);
  for (const report of reports) {
    const pct = (m: CoverageMetric): string => `${m}=${report.metrics[m].toFixed(2)}%`;
    const head =
      report.status === "pass"
        ? `PASS ${report.name}`
        : report.status === "fail"
          ? `FAIL ${report.name}`
          : report.status === "malformed"
            ? `MALFORMED ${report.name}`
            : `MISSING ${report.name}`;
    lines.push(`${head}  ${METRICS.map(pct).join("  ")}`);
    if (report.status === "fail") {
      lines.push(
        `  → failing metrics: ${report.failingMetrics.join(", ")}`,
      );
    } else if (report.status === "malformed" || report.status === "missing") {
      lines.push(`  → ${report.error ?? report.status}`);
    }
  }
  return lines.join("\n");
};

export const run = (args: RunArgs): RunResult => {
  const threshold = args.threshold ?? DEFAULT_THRESHOLD;
  const reports = evaluate(args.workspaceDirs.map(parseSummary), threshold);
  const failures = reports.filter((r) => r.status !== "pass");

  if (args.disabled === true) {
    const body = formatReport(reports, threshold);
    return {
      code: 0,
      stdout: `WARN: coverage gate disabled (coverage.disabled=true)\n${body}\n→ exit 0 (gate bypassed)`,
      stderr: "",
    };
  }

  if (failures.length === 0) {
    return {
      code: 0,
      stdout: `${formatReport(reports, threshold)}\n→ exit 0`,
      stderr: "",
    };
  }

  const report = formatReport(reports, threshold);
  const failingNames = failures.map((f) => f.name).join(", ");
  return {
    code: 1,
    stdout: `${report}\n→ exit 1`,
    stderr: `Coverage gate FAILED for package(s): ${failingNames}\nThreshold: ${threshold}%\n${report}`,
  };
};

/** Discover the workspace roots that ship a vitest.config.ts file AND
 *  configure coverage thresholds (the six packages added in M5 D4).
 *  Packages without a `coverage.thresholds` block are ignored — the
 *  per-package gate is not configured for them, so the validator has
 *  no contract to enforce. */
const discoverWorkspaces = (rootDir: string): string[] => {
  const candidates: string[] = [];
  const visit = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name;
        // Skip dependency / cache / tooling directories that may
        // also carry a vitest.config (e.g. tools/eslint-plugin-boundary).
        if (
          name === "node_modules" ||
          name.startsWith(".") ||
          name === "tools" ||
          name === "dist" ||
          name === "coverage"
        ) {
          continue;
        }
        visit(join(dir, name));
      } else if (entry.isFile() && entry.name === "vitest.config.ts") {
        if (configHasThresholds(join(dir, "vitest.config.ts"))) {
          candidates.push(dir);
        }
      }
    }
  };
  visit(rootDir);
  return candidates;
};

const configHasThresholds = (configPath: string): boolean => {
  try {
    return readFileSync(configPath, "utf8").includes("thresholds");
  } catch {
    return false;
  }
};

const isCliInvocation = (): boolean => {
  if (typeof process === "undefined") return false;
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string") return false;
  return argv1.endsWith("coverage-validator.ts") || argv1.endsWith("coverage-validator.js");
};

const invokeCli = (): void => {
  if (!isCliInvocation()) return;
  const root = process.cwd();
  const dirs = discoverWorkspaces(root);
  const disabled = process.env["coverage.disabled"] === "true";
  const result = run({ workspaceDirs: dirs, disabled });
  if (result.stdout.length > 0) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr.length > 0) process.stderr.write(`${result.stderr}\n`);
  process.exit(result.code);
};

invokeCli();
