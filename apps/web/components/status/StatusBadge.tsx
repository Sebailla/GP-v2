export function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error" | "info";
  children: React.ReactNode;
}): React.JSX.Element {
  const cls =
    tone === "ok"
      ? "bg-green-100 text-green-800"
      : tone === "warn"
      ? "bg-yellow-100 text-yellow-800"
      : tone === "error"
      ? "bg-red-100 text-red-800"
      : "bg-blue-100 text-blue-800";
  return (
    <span
      role="status"
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}
