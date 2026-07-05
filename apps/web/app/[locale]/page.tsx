/**
 * Minimal landing page. Slice 1 ships a single placeholder; the
 * authenticated landing surface (`/{locale}/(app)/transactions`)
 * lands in slice 6, and the unauthenticated CTA routes
 * (`/{locale}/(auth)/sign-in`) land in slice 4.
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
    </main>
  );
}