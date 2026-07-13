#!/usr/bin/env node
/**
 * Fixture runner for the boundary ESLint plugin.
 *
 * Contract per rule:
 *   - exactly one `valid.{ts,md}` somewhere under
 *     __fixtures__/<rule>/ (any depth).
 *   - exactly one `invalid.{ts,md}` somewhere under
 *     __fixtures__/<rule>/ (any depth).
 *
 * The fixture path mirrors the production path the rule targets,
 * so the rule's own path check fires correctly. For example:
 *
 *   __fixtures__/no-prisma-outside-core/
 *   ├── libs/core/database/src/valid.ts     <-- inside core
 *   └── invalid.ts                          <-- outside core
 *
 * For .ts rules: applies ONLY that single rule globally via ESLint
 * and asserts:
 *   - valid.*:   0 errors, 0 fatal crashes.
 *   - invalid.*: >=1 errors, 0 fatal crashes.
 *
 * For .md rules (no-mojibake-in-docs): ESLint's default parser cannot
 * parse Markdown, so the runner reads the file directly and calls
 * the shared CJK detector (lib/cjk-detect.cjs). The rule's source
 * remains the canonical implementation for `pnpm turbo run lint` once
 * @eslint/markdown is wired in (deferred).
 *
 * Multi-invalid semantics: a rule may declare `allowMultipleInvalids: true`
 * (e.g. `no-mojibake-in-docs`) to permit multiple `invalid*.${ext}`
 * fixtures — every match must still report >=1 errors. Other rules keep
 * the "exactly one invalid" invariant; the runner throws on drift.
 *
 * Exits 0 on full pass, 1 on any failure.
 */
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import { glob } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const fixturesRoot = resolve(pluginRoot, "__fixtures__");
const plugin = (await import("../index.cjs")).default;
const { findCjkInText } = require("../lib/cjk-detect.cjs");

const RULES = [
  { name: "no-client-server-import" },
  { name: "no-prisma-outside-core" },
  { name: "no-schemas-outside-shared" },
  { name: "no-cross-module-import" },
  // `no-mojibake-in-docs` opts in to multiple invalid fixtures so the
  // triangulation case (CJK on a non-first line) can land alongside the
  // primary fixture (CJK on first lines). Both must still report >=1 CJK.
  { name: "no-mojibake-in-docs", allowMultipleInvalids: true },
];

const extFor = (ruleName) => (ruleName === "no-mojibake-in-docs" ? "md" : "ts");

async function findFixtures(ruleDir, variant, ext) {
  // For `invalid`, exactly one match is required by default (the primary
  // violation case); rules that opt in to triangulation (e.g.
  // `no-mojibake-in-docs` with `allowMultipleInvalids: true`) may have more
  // than one — every match must still report >=1 errors.
  // For `valid`, multiple matches are allowed (primary case + triangulation
  // cases such as allowed exceptions); every match must report 0 errors.
  // The invalid glob is anchored as a *substring* (`*invalid*.${ext}`) so
  // triangulation fixtures like `secondCjkLine.invalid.md` match alongside
  // the primary `invalid.${ext}`. The valid glob stays anchored at the start
  // (`valid*.${ext}`) so `invalid.${ext}` files do NOT appear as valid
  // candidates — preventing cross-rule leakage in the runner.
  const matches = [];
  const pattern =
    variant === "invalid"
      ? `**/*${variant}*.${ext}`
      : `**/${variant}*.${ext}`;
  for await (const entry of glob(pattern, { cwd: ruleDir })) {
    matches.push(resolve(ruleDir, entry));
  }
  return matches;
}

/**
 * Lint a .ts fixture via ESLint, applying ONLY the named rule.
 */
async function lintTsFixture(ruleName, fixture) {
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    baseConfig: {
      files: ["**/*.ts"],
      plugins: { "@gpr/boundary": plugin },
      rules: {
        [`@gpr/boundary/${ruleName}`]: "error",
      },
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
  });
  return eslint.lintFiles([fixture]);
}

/**
 * Detect CJK chars in a .md fixture directly (no ESLint, no parser).
 * Mirrors the rule's logic via lib/cjk-detect.cjs.
 */
function detectCjkInMdFixture(fixture) {
  const text = readFileSync(fixture, "utf8");
  const hits = findCjkInText(text);
  return {
    errorCount: hits.length,
    fatalErrorCount: 0,
    messages: hits.map((hit) => ({
      severity: 2,
      message: `Ideographic codepoint U+${hit.code
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")} at offset ${hit.index}`,
    })),
  };
}

let totalViolations = 0;
let passed = 0;
let failed = 0;
const failures = [];

for (const rule of RULES) {
  const ext = extFor(rule.name);
  const ruleDir = resolve(fixturesRoot, rule.name);

  if (!existsSync(ruleDir)) {
    failures.push({
      rule: rule.name,
      fixture: relative(repoRoot, ruleDir),
      reason: "fixture directory missing",
    });
    failed += 1;
    continue;
  }

  let validPaths;
  let invalidPaths;
  try {
    const valids = await findFixtures(ruleDir, "valid", ext);
    if (valids.length === 0) {
      throw new Error(`missing fixture: valid.${ext} under ${relative(repoRoot, ruleDir)}`);
    }
    validPaths = valids;
    const invalids = await findFixtures(ruleDir, "invalid", ext);
    if (invalids.length === 0) {
      throw new Error(`missing fixture: invalid.${ext} under ${relative(repoRoot, ruleDir)}`);
    }
    // Per-rule invariant: by default exactly one invalid fixture;
    // rules that opt in via `allowMultipleInvalids: true` may have
    // many — every match still has to report >=1 errors below.
    if (!rule.allowMultipleInvalids && invalids.length > 1) {
      throw new Error(
        `ambiguous invalid fixture (${invalids.length} matches); only one allowed: ${relative(repoRoot, ruleDir)}`,
      );
    }
    invalidPaths = invalids;
  } catch (err) {
    failures.push({
      rule: rule.name,
      fixture: relative(repoRoot, ruleDir),
      reason: err.message,
    });
    failed += 1;
    continue;
  }

  // Build the test set: all valid fixtures must report 0 errors;
  // every invalid fixture (one by default, multiple for rules that
  // opt in) must report >=1 errors.
  const tests = [
    ...validPaths.map((p) => ({ variant: "valid", fixture: p })),
    ...invalidPaths.map((p) => ({ variant: "invalid", fixture: p })),
  ];

  for (const { variant, fixture } of tests) {
    const fixtureRel = relative(repoRoot, fixture);

    let result;
    let runnerThrew = null;
    try {
      if (ext === "ts") {
        const results = await lintTsFixture(rule.name, fixture);
        result = results[0] ?? { errorCount: 0, fatalErrorCount: 0, messages: [] };
      } else {
        result = detectCjkInMdFixture(fixture);
      }
    } catch (err) {
      runnerThrew = err && err.message ? err.message : String(err);
    }

    if (runnerThrew !== null) {
      failures.push({
        rule: rule.name,
        fixture: fixtureRel,
        reason: `runner threw: ${runnerThrew}`,
      });
      failed += 1;
      continue;
    }

    const errorCount = result.errorCount;
    const fatalErrorCount = result.fatalErrorCount;

    if (fatalErrorCount > 0) {
      const messages = (result.messages || [])
        .map(
          (m) =>
            `[${m.severity === 2 ? "err" : "warn"}] ${m.message} (line ${
              m.line ?? "?"
            }, col ${m.column ?? "?"})`,
        )
        .join("\n        ");
      failures.push({
        rule: rule.name,
        fixture: fixtureRel,
        reason: `rule crashed (fatalErrorCount=${fatalErrorCount}); messages:\n        ${messages || "<no messages>"}`,
      });
      failed += 1;
      continue;
    }

    if (variant === "valid" && errorCount > 0) {
      failures.push({
        rule: rule.name,
        fixture: fixtureRel,
        reason: `expected 0 errors, got ${errorCount}`,
      });
      failed += 1;
      continue;
    }

    if (variant === "invalid" && errorCount === 0) {
      failures.push({
        rule: rule.name,
        fixture: fixtureRel,
        reason: `expected >=1 errors, got 0`,
      });
      failed += 1;
      continue;
    }

    if (variant === "invalid") totalViolations += errorCount;
    passed += 1;
    // For multi-invalid rules, the bare `<variant>.${ext}` name would be
    // ambiguous; show the relative path so each fixture is identifiable
    // in the runner's output.
    const label = rule.allowMultipleInvalids
      ? `${rule.name}/${relative(ruleDir, fixture)}`
      : `${rule.name}/${variant}.${ext}`;
    console.log(`PASS  ${label}  (errors=${errorCount})`);
  }
}

// Production-tree CJK scan: every Documents-es/**/*.md file under the
// repo root MUST be CJK-clean. The eslint.config.mjs ignores list
// (line 30) already excludes __fixtures__/** so this glob sees only
// production mirrors. Mirrors the rule's AST Program/root scan via
// lib/cjk-detect.cjs.
console.log("");
console.log("Production Documents-es/**/*.md CJK scan:");
const prodMirrorFiles = [];
for await (const entry of glob("Documents-es/**/*.md", { cwd: repoRoot })) {
  prodMirrorFiles.push(resolve(repoRoot, entry));
}
for (const file of prodMirrorFiles) {
  const text = readFileSync(file, "utf8");
  const hits = findCjkInText(text);
  if (hits.length === 0) {
    passed += 1;
    console.log(`PASS  ${relative(repoRoot, file)}  (clean)`);
  } else {
    failures.push({
      rule: "no-mojibake-in-docs",
      fixture: relative(repoRoot, file),
      reason: `production mirror contains ${hits.length} CJK codepoints`,
    });
    failed += 1;
    console.error(
      `FAIL  ${relative(repoRoot, file)}  (${hits.length} CJK codepoints)`,
    );
  }
}

console.log("");
console.log(`Fixture summary: ${passed} passed, ${failed} failed`);
console.log(`Total violations across invalid fixtures: ${totalViolations}`);

if (failures.length > 0) {
  console.error("");
  console.error("Failures:");
  for (const f of failures) {
    console.error(`  - ${f.rule} :: ${f.fixture}`);
    console.error(`      ${f.reason}`);
  }
  process.exit(1);
}

process.exit(0);
