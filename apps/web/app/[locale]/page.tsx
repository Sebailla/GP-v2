import { env } from "@core/config";

/**
 * Minimal landing page. Slice 1 ships a single placeholder; the
 * authenticated landing surface (`/{locale}/(app)/transactions`)
 * lands in slice 6, and the unauthenticated CTA routes
 * (`/{locale}/(auth)/sign-in`) land in slice 4.
 *
 * The `env` import runs at module load time so the Zod schema
 * validates `process.env` and the process fails-fast on a missing
 * or malformed variable before any HTTP request is served.
 */

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function LandingPage({ params }: PageProps) {
  const { locale } = await params;
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>gastos-personales-reference</h1>
      <p>
        Vertical-slicing reference scaffold &mdash; locale:{" "}
        <code>{locale}</code>
      </p>
      <p style={{ color: "#666" }}>
        Slice 1 placeholder. Auth UI lands in slice 4, transactions in
        slice 6.
      </p>
      <p style={{ color: "#999", fontSize: "0.75rem" }}>
        NODE_ENV: <code>{env.NODE_ENV}</code>
      </p>
    </main>
  );
}