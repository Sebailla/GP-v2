export interface StatusPayload {
  environment: "development" | "test" | "staging" | "production";
  version: string;
  commit: string;
  startedAt: string;
  uptimeSeconds: number;
  publicUrl: { web: string; api: string };
  lastBackupAt: string | null;
  lastBackupStatus: "ok" | "failed" | "never";
  rateLimitStore: "upstash" | "postgres" | "memory";
  mailAdapter: "smtp-gmail" | "console";
}

export async function fetchStatus(apiUrl: string): Promise<StatusPayload> {
  const res = await fetch(`${apiUrl}/status`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`status fetch failed: ${res.status}`);
  }
  return (await res.json()) as StatusPayload;
}
