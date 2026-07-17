import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Reset-password email template (D6).
 *
 * The canonical template lives in `reset-password.json` alongside
 * this module. We load it at module init via `readFileSync` rather
 * than `import json` because:
 *  1. `resolveJsonModule` is NOT enabled in the project's
 *     tsconfig (the codebase prefers hand-typed objects so a
 *     translator editing the JSON sees the literal shape).
 *  2. JSON-as-text keeps the template auditable in a single
 *     place; the renderer below can be tested without juggling
 *     import attributes.
 *
 * The renderer (`renderResetPasswordTemplate`) is the ONLY public
 * surface — never read the JSON directly from controllers.
 *
 * **Module-2 PR #3 (task 3.7):** the RED+GREEN pair in
 * `apps/api/src/mail/__tests__/reset-templates.test.ts` pins the
 * en/es shape and asserts the URL is embedded verbatim in the
 * `cta` line. The locale enum is closed (`"en" | "es"`); a future
 * locale addition extends the JSON + the type below in one place.
 */

const here = __dirname;

interface RawTemplate {
  readonly subject: string;
  readonly title: string;
  readonly intro: string;
  readonly cta: string;
  readonly expiry: string;
  readonly ignore: string;
  readonly footer: string;
}

type Locale = "en" | "es";
type TemplateCatalog = Readonly<Record<Locale, RawTemplate>>;

let cached: TemplateCatalog | null = null;

function loadCatalog(): TemplateCatalog {
  if (cached !== null) return cached;
  const path = join(here, "reset-password.json");
  const text = readFileSync(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`reset-password.json: expected object, got ${typeof parsed}`);
  }
  cached = parsed as TemplateCatalog;
  return cached;
}

export interface RenderedResetEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Render the locale-aware password-reset email body.
 *
 * The `resetUrl` is embedded verbatim into both the plaintext
 * (`text`) and HTML (`html`) bodies. The CTA line in the
 * template is rendered as a hyperlink in HTML and as a stand-alone
 * URL in plaintext (the same pattern next-intl emails use).
 */
export function renderResetPasswordTemplate(
  locale: Locale,
  resetUrl: string,
): RenderedResetEmail {
  const tpl = loadCatalog()[locale];
  const text = [
    tpl.title,
    "",
    tpl.intro,
    "",
    `${tpl.cta}: ${resetUrl}`,
    "",
    tpl.expiry,
    tpl.ignore,
    "",
    tpl.footer,
  ].join("\n");
  const html = [
    `<h1>${escapeHtml(tpl.title)}</h1>`,
    `<p>${escapeHtml(tpl.intro)}</p>`,
    `<p><a href="${escapeAttr(resetUrl)}">${escapeHtml(tpl.cta)}</a></p>`,
    `<p>${escapeHtml(tpl.expiry)}</p>`,
    `<p>${escapeHtml(tpl.ignore)}</p>`,
    `<footer>${escapeHtml(tpl.footer)}</footer>`,
  ].join("\n");
  return { subject: tpl.subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * Lookup helper for the email recipient. The
 * `auth.password-reset.requested` payload carries `userId` but not
 * the email address (the email is the request body's input, which
 * the service does not persist). For the dev mailbox we already
 * have the `to` field in the dispatched payload — but the
 * production path does not, so the controller's subscriber needs
 * to resolve the email from the userId.
 *
 * The current implementation is a stub that throws — the
 * production caller MUST supply `to` in the dispatched payload
 * OR wire a real `UserRepository.findById` here. Module-2 PR #3
 * keeps this throw as a defensive contract: a forgotten `to`
 * surfaces as a 500 with a clear cause instead of leaking an
 * empty `to` field to SMTP.
 */
export function lookupEmailForUserId(_userId: string): string {
  throw new Error(
    "lookupEmailForUserId is not implemented — supply `to` in the dispatched payload OR wire a UserRepository lookup",
  );
}