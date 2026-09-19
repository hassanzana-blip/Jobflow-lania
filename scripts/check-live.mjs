/**
 * Verifies that a deployment's own credentials actually work, so "the variable
 * is set" is never mistaken for "the connection works". Run it with the
 * production environment loaded:
 *
 *   node --env-file=.env.production.local scripts/check-live.mjs
 *
 * Prints nothing that could not go in a public log: variable names, the
 * database host, row counts, and errors with the connection string stripped.
 * Exits non-zero when a required check fails.
 */
import postgres from "postgres";
import {
  describeConnection,
  envReport,
  poolerWarnings,
} from "../src/core/diagnostics.ts";

const report = envReport(process.env);
let failed = false;

console.log("Environment");
for (const { name, present } of report.required)
  console.log(`  ${present ? "set" : "MISSING"}  ${name}`);
for (const { name, present } of report.optional)
  console.log(`  ${present ? "set" : "unset  "}  ${name} (optional)`);

if (!process.env.DATABASE_URL) {
  console.error("\nDATABASE_URL is not set; cannot check the database.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
console.log(`\nDatabase ${describeConnection(url)}`);
for (const warning of poolerWarnings(url)) console.log(`  note: ${warning}`);

// Same options as src/server/db.ts, so a success here means the app's own
// client can connect too.
const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });
try {
  const started = Date.now();
  const [{ now }] = await sql`select now() as now`;
  console.log(`  connected in ${Date.now() - started} ms, server time ${now.toISOString()}`);

  const [{ count: tables }] =
    await sql`select count(*)::int as count from information_schema.tables where table_schema='jobbflow'`;
  console.log(`  jobbflow tables: ${tables}`);
  if (tables === 0) {
    console.error("  FAIL: the jobbflow schema is empty; the migration has not been applied.");
    failed = true;
  }

  const [trigger] =
    await sql`select 1 from pg_trigger where tgname='on_jobbflow_auth_user_created' and not tgisinternal`;
  console.log(`  new-user trigger: ${trigger ? "present" : "NOT FOUND"}`);

  const unprotected = await sql`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='jobbflow' and c.relkind='r' and not c.relrowsecurity`;
  if (unprotected.length) {
    console.error(`  FAIL: row level security is off on ${unprotected.map((r) => r.relname).join(", ")}`);
    failed = true;
  } else console.log("  row level security: on for every table");
} catch (error) {
  // The message can quote the connection string, password included.
  const safe = String(error?.message ?? error).replaceAll(url, describeConnection(url));
  console.error(`  FAIL: ${safe}`);
  failed = true;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

console.log(failed ? "\nFailed." : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
