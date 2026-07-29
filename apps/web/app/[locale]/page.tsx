import { getTranslations } from "next-intl/server";
import { env } from "@core/config";

import { getSession } from "@/lib/auth-server";

/**
 * Slice-1 placeholder landing page + slice 4 batch 2
 * authenticated surface.
 *
 * **Slice 1 baseline.** `import { env } from "@core/config"` at
 * module load triggers the Zod env-schema parse, so the process
 * fails-fast on a missing or malformed variable. The page renders
 * a minimal landing with the `env.NODE_ENV` indicator.
 *
 * **Slice 4 cookie migration final.** The page now reads the authjs.session-token
 * cookie via `getSession()` and renders a different tree when a
 * session is present:
 *  - **Unauthenticated** (no cookie): the slice-1 placeholder.
 *  - **Authenticated** (cookie present): the user's email + a
 *    "Welcome" message + a (slice 6+) sign-out button slot.
 *
 * The split is server-side; no client-side auth check is needed
 * because the redirect-if-already-authenticated check on the 4
 * auth pages (sign-in, sign-up, forgot, reset) ensures an
 * unauthenticated visitor can never reach a sensitive form even
 * if they navigate directly. The landing IS the post-auth
 * destination for all 4 forms' success paths.
 *
 * **Locale prefix handling.** `next-intl` always prefixes the
 * locale in the URL (`/en`, `/es`). The page preserves the
 * active locale through the render; the email body uses
 * next-intl's `t.rich(...)` with the `{email}` placeholder so
 * the message interpolates the session's email in the active
 * locale's punctuation.
 */

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function LandingPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { locale } = await params;
  const session = await getSession();

  if (session === null) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>gastos-personales-reference</h1>
        <p>
          Vertical-slicing reference scaffold &mdash; locale: <code>{locale}</code>
        </p>
        <p style={{ color: "#666" }}>
          Slice 1 placeholder. Auth UI lands in slice 4, transactions in slice 6.
        </p>
        <p style={{ color: "#999", fontSize: "0.75rem" }}>
          NODE_ENV: <code>{env.NODE_ENV}</code>
        </p>
      </main>
    );
  }

  const t = await getTranslations("auth.dashboard");
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>gastos-personales-reference</h1>
      <p>{t("welcome", { email: session.user.email })}</p>
      <p style={{ color: "#999", fontSize: "0.75rem" }}>
        NODE_ENV: <code>{env.NODE_ENV}</code>
      </p>
    </main>
  );
}
