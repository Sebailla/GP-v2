import { describe, it, expect } from "vitest";

import { renderResetPasswordTemplate } from "../templates/reset-password.js";

/**
 * TDD contract for the reset-password email template renderer
 * (Module-2 PR #3 task 3.7 — D6).
 *
 * Per `openspec/changes/module-2-public-auth/design.md` §2 D6:
 * the reset email body MUST be sourced from a single canonical
 * `reset-password.json` template keyed by locale (`en`|`es`).
 * The renderer (`renderResetPasswordTemplate`) is the ONLY
 * public surface; controllers never read the JSON directly.
 *
 * Acceptance contract:
 *  - Both locales (`en` and `es`) render successfully with no
 *    missing-key errors.
 *  - The reset URL appears verbatim in BOTH the plaintext and
 *    HTML bodies.
 *  - The locale determines the rendered language: `en` returns
 *    English copy; `es` returns Spanish copy.
 *  - The CTA line is rendered as a hyperlink in HTML and as a
 *    stand-alone URL in plaintext.
 *
 * The closed locale enum is intentional (per D6 + the
 * `next-intl` routing locales shipped in apps/web). A future
 * locale addition extends the JSON + the TS type in one place.
 */

const TEST_RESET_URL = "http://localhost:3000/en/reset-password/abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("renderResetPasswordTemplate (D6 — locale-keyed template)", () => {
  describe("en locale", () => {
    it("returns a non-empty subject + body that includes the reset URL verbatim", () => {
      const out = renderResetPasswordTemplate("en", TEST_RESET_URL);
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.text).toContain(TEST_RESET_URL);
      expect(out.html).toContain(TEST_RESET_URL);
    });

    it("uses English copy (title contains 'Reset')", () => {
      const out = renderResetPasswordTemplate("en", TEST_RESET_URL);
      expect(out.text.toLowerCase()).toContain("reset");
      expect(out.subject.toLowerCase()).toContain("reset");
    });
  });

  describe("es locale", () => {
    it("returns a non-empty subject + body that includes the reset URL verbatim", () => {
      const out = renderResetPasswordTemplate("es", TEST_RESET_URL);
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.text).toContain(TEST_RESET_URL);
      expect(out.html).toContain(TEST_RESET_URL);
    });

    it("uses Spanish copy (title contains 'Restablec')", () => {
      const out = renderResetPasswordTemplate("es", TEST_RESET_URL);
      // Spanish title includes "Restablec" (from "Restablecer"/"Restablecé").
      expect(out.text.toLowerCase()).toMatch(/restablec/);
      expect(out.subject.toLowerCase()).toMatch(/restablec/);
    });

    it("renders the URL with the Spanish path prefix", () => {
      const esUrl = "http://localhost:3000/es/reset-password/" + "f".repeat(64);
      const out = renderResetPasswordTemplate("es", esUrl);
      expect(out.text).toContain(esUrl);
      // And explicitly does NOT substitute an English URL.
      expect(out.text).not.toContain("/en/reset-password/");
    });
  });

  describe("URL safety", () => {
    it("escapes HTML-significant characters in the URL inside the HTML body", () => {
      // Even though real reset URLs use only [A-Za-z0-9_-], the renderer
      // must not crash on a URL containing `&` or `<` (the URL is
      // rendered as an href attribute AND as text).
      const weirdUrl = "http://localhost:3000/en/reset-password/abc?x=1&y=2";
      const out = renderResetPasswordTemplate("en", weirdUrl);
      expect(out.html).toContain(weirdUrl.replace(/&/g, "&amp;"));
    });
  });
});