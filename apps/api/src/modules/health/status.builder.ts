import { env } from "@core/config";

export type BackupStatus = "ok" | "failed" | "never";
export type RateLimitStoreKind = "upstash" | "postgres" | "memory";
export type MailAdapterKind = "smtp-gmail" | "console";

export interface StatusPayload {
  environment: "development" | "test" | "staging" | "production";
  version: string;
  commit: string;
  startedAt: string;
  uptimeSeconds: number;
  publicUrl: { web: string; api: string };
  lastBackupAt: string | null;
  lastBackupStatus: BackupStatus;
  rateLimitStore: RateLimitStoreKind;
  mailAdapter: MailAdapterKind;
}

const startedAt = new Date();

/**
 * Build the public status payload. Sensitive values (JWT secrets,
 * DATABASE_URL, MAIL_DSN) are intentionally NEVER read into the
 * payload object — the controller must NOT accept any extension that
 * re-exposes them. If a new field is added, it MUST be reviewed for
 * sensitivity.
 */
export function buildStatusPayload(opts: {
  commit: string;
  version: string;
  lastBackupAt: string | null;
  lastBackupStatus: BackupStatus;
  rateLimitStore: RateLimitStoreKind;
  mailAdapter: MailAdapterKind;
}): StatusPayload {
  const uptimeSeconds = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / 1000),
  );
  return {
    environment: env.NODE_ENV,
    version: opts.version,
    commit: opts.commit,
    startedAt: startedAt.toISOString(),
    uptimeSeconds,
    publicUrl: {
      web: env.PUBLIC_WEB_URL,
      api: env.PUBLIC_API_URL,
    },
    lastBackupAt: opts.lastBackupAt,
    lastBackupStatus: opts.lastBackupStatus,
    rateLimitStore: opts.rateLimitStore,
    mailAdapter: opts.mailAdapter,
  };
}