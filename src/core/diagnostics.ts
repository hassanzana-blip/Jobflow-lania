/**
 * Pure helpers for the live connection check (`npm run check:live`).
 *
 * The rule the whole file exists to enforce: a diagnostic may report that a
 * secret is *present*, never what it is. Connection strings in particular are
 * printed as host and database only — a stack trace or CI log that quotes the
 * URL would hand over the database password.
 */
export const REQUIRED_ENV = [
  "APP_BASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
] as const;

export const OPTIONAL_ENV = [
  "META_MODEL_API_KEY",
  "RESEND_API_KEY",
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
] as const;

/** `postgresql://user:pw@host:5432/db` → `host:5432/db`. Never the credentials. */
export function describeConnection(url: string) {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, "") || "(default)";
    return `${parsed.hostname}:${parsed.port || "5432"}/${database}`;
  } catch {
    return "(unparseable connection string)";
  }
}

/**
 * The transaction pooler multiplexes sessions, so prepared statements leak
 * between them; `src/server/db.ts` sets `prepare:false` for exactly that.
 * Port 5432 on a pooler host is the session pooler and a different contract.
 */
export function poolerWarnings(url: string) {
  const warnings: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return ["DATABASE_URL is not a valid URL."];
  }
  const pooled = parsed.hostname.includes("pooler.supabase.com");
  if (pooled && parsed.port !== "6543")
    warnings.push(
      `Pooler host on port ${parsed.port || "5432"}: src/server/db.ts is written for the transaction pooler on 6543.`,
    );
  if (!pooled && parsed.hostname.includes("supabase"))
    warnings.push(
      "Direct database host: serverless functions exhaust direct connections; prefer the transaction pooler.",
    );
  return warnings;
}

export function envReport(env: Record<string, string | undefined>) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]);
  return {
    // Names and presence only. Values never leave this process.
    required: REQUIRED_ENV.map((name) => ({ name, present: Boolean(env[name]) })),
    optional: OPTIONAL_ENV.map((name) => ({ name, present: Boolean(env[name]) })),
    missing,
  };
}
