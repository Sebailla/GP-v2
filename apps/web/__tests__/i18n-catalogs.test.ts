import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Catalog sync check for `apps/web/messages/{en,es}.json` — slice 4 (T4.2).
 *
 * Per design §6.3 (\"Keyed by feature module + screen, e.g.
 * auth.login.title\"), both locales MUST carry an identical key tree so
 * the React components can read \`t(\`auth.signIn.title\`)\` regardless
 * of the active locale without branching on missing keys.
 *
 * The verification is structural: read both JSON files, flatten each
 * to a \`Set<dotted-path>\`, and assert the two sets are equal. The
 * content of each leaf differs (English vs Spanish prose) — that's the
 * translator's job and is NOT asserted here.
 *
 * This is NOT a TDD test in the strict sense — there's no behavior to
 * drive (the JSON is documentation/data). It's a regression net against
 * a future edit that adds \`auth.signIn.rememberMe\` to \`en.json\`
 * only and forgets \`es.json\`, which would surface at runtime as a
 * \`MISSING_MESSAGE\` warning in next-intl.
 */

type JsonShape = string | number | boolean | null | JsonShape[] | { [k: string]: JsonShape };

function flatten(obj: JsonShape, prefix = "", out: Set<string> = new Set()): Set<string> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    // Leaf — push the full dotted path.
    out.add(prefix);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix === "" ? k : `${prefix}.${k}`;
    flatten(v as JsonShape, next, out);
  }
  return out;
}

const MESSAGES_DIR = path.resolve(__dirname, "../messages");

function loadCatalogKeys(locale: "en" | "es"): Set<string> {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  const raw = readFileSync(filePath, "utf8");
  // Wrap in try/catch so the test's diagnostic print gives the caller
  // the actual parse error instead of a raw exception from JSON.parse.
  let parsed: JsonShape;
  try {
    parsed = JSON.parse(raw) as JsonShape;
  } catch (error) {
    throw new Error(
      `Failed to parse apps/web/messages/${locale}.json — ${(error as Error).message}`,
    );
  }
  return flatten(parsed);
}

describe("i18n catalogs — key-set parity (T4.2)", () => {
  it("both en.json and es.json exist as JSON-parsable files", () => {
    // Sanity: confirm both files parse without throwing. The
    // flatten() helper would throw on malformed JSON, so a
    // dedicated assertion makes the failure mode legible.
    expect(() => loadCatalogKeys("en")).not.toThrow();
    expect(() => loadCatalogKeys("es")).not.toThrow();
  });

  it("the en.json key tree is non-empty (catalog has at least the auth surface)", () => {
    // The slice 4 batch 4a brief mandates auth.signIn.* + auth.signUp.*
    // + auth.forgotPassword.* + auth.resetPassword.* + auth.sessions.*
    // + auth.devMailbox.* + auth.common.* + auth.locale.{en,es}.
    const enKeys = loadCatalogKeys("en");
    expect(enKeys.size).toBeGreaterThan(20);
    expect(enKeys.has("auth.signIn.title")).toBe(true);
    expect(enKeys.has("auth.signIn.email")).toBe(true);
    expect(enKeys.has("auth.signIn.password")).toBe(true);
    expect(enKeys.has("auth.signIn.submit")).toBe(true);
    expect(enKeys.has("auth.signIn.error.invalidCredentials")).toBe(true);
    expect(enKeys.has("auth.signUp.title")).toBe(true);
    expect(enKeys.has("auth.signUp.name")).toBe(true);
    expect(enKeys.has("auth.signUp.submit")).toBe(true);
    expect(enKeys.has("auth.signUp.error.duplicateEmail")).toBe(true);
    expect(enKeys.has("auth.forgotPassword.title")).toBe(true);
    expect(enKeys.has("auth.forgotPassword.submit")).toBe(true);
    expect(enKeys.has("auth.forgotPassword.success")).toBe(true);
    expect(enKeys.has("auth.resetPassword.title")).toBe(true);
    expect(enKeys.has("auth.resetPassword.newPassword")).toBe(true);
    expect(enKeys.has("auth.resetPassword.submit")).toBe(true);
    expect(enKeys.has("auth.resetPassword.error.invalidToken")).toBe(true);
    expect(enKeys.has("auth.resetPassword.success")).toBe(true);
    expect(enKeys.has("auth.sessions.title")).toBe(true);
    expect(enKeys.has("auth.sessions.empty")).toBe(true);
    expect(enKeys.has("auth.devMailbox.title")).toBe(true);
    expect(enKeys.has("auth.devMailbox.noTokensHint")).toBe(true);
    expect(enKeys.has("auth.common.loading")).toBe(true);
    expect(enKeys.has("auth.common.genericError")).toBe(true);
    expect(enKeys.has("auth.locale.en")).toBe(true);
    expect(enKeys.has("auth.locale.es")).toBe(true);
  });

  it("en.json and es.json carry identical key trees (no missing keys in either locale)", () => {
    const enKeys = loadCatalogKeys("en");
    const esKeys = loadCatalogKeys("es");

    // Symmetric difference MUST be empty: every key in en.json is in
    // es.json and vice versa. The set-difference assertion flags the
    // first missing key on either side as a regression (e.g. someone
    // adds auth.signIn.rememberMe to en.json but not es.json).
    const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
    const missingInEn = [...esKeys].filter((k) => !enKeys.has(k));

    expect(missingInEs).toEqual([]);
    expect(missingInEn).toEqual([]);
    // Belt-and-suspenders: the two sets have the same size (this also
    // catches duplicated keys, which JSON disallows at parse time so
    // it's belt-only but documents the invariant).
    expect(enKeys.size).toBe(esKeys.size);
  });

  it("the catalogs are clean of mojibake indicators (CJK fallthrough)", () => {
    // The project AGENTS.md §13 has a `no-mojibake-in-docs` ESLint rule
    // (deferred to slice 8) that blocks CJK codepoints in
    // Documents-es/. We mirror that intent at the catalog level: a
    // translator tool that's set to a CJK-source language and runs
    // against the English source would produce CJK in es.json (wrong
    // locale). This assertion flags that exact regression.
    const es = readFileSync(path.join(MESSAGES_DIR, "es.json"), "utf8");
    const en = readFileSync(path.join(MESSAGES_DIR, "en.json"), "utf8");

    // CJK Unified Ideographs range: \u4e00-\u9fff (the most common
    // mojibake source when Latin text is auto-translated via a CJK
    // fallback locale).
    const cjk = /[\u4e00-\u9fff]/;
    expect(es).not.toMatch(cjk);
    expect(en).not.toMatch(cjk);
  });
});
