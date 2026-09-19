import test from "node:test";
import assert from "node:assert/strict";
import { classifyAuthError, isSilentAuthError } from "../src/core/auth-errors.ts";
import {
  callbackDestination,
  failureRedirect,
  parseCallback,
} from "../src/core/auth-callback.ts";
import { resolveError } from "../src/core/api-errors.ts";
import {
  readSearchUrl,
  searchUrlQuery,
  QUERY_MAX,
} from "../src/core/search-params.ts";
import { sv } from "../src/i18n/sv.ts";

const supabaseError = (code: string, status = 400, message = "") => ({
  code,
  status,
  message,
  name: "AuthApiError",
});

test("e-mail links verify server side and work on a second device", () => {
  const confirm = parseCallback(
    "https://jobbflow.test/auth/callback?token_hash=abc123&type=email",
  );
  assert.deepEqual(confirm, {
    kind: "verify",
    tokenHash: "abc123",
    type: "email",
    destination: "/app",
  });

  const recovery = parseCallback(
    "https://jobbflow.test/auth/callback?token_hash=xyz&type=recovery",
  );
  assert.equal(recovery.kind === "verify" && recovery.destination, "/aterstall-losenord");

  // The recovery template carries `next`; the type is inferred when absent.
  const legacyRecovery = parseCallback(
    "https://jobbflow.test/auth/callback?token_hash=xyz&next=reset-password",
  );
  assert.equal(legacyRecovery.kind === "verify" && legacyRecovery.type, "recovery");
  assert.equal(
    legacyRecovery.kind === "verify" && legacyRecovery.destination,
    "/aterstall-losenord",
  );

  // An unknown type must not reach Supabase unchecked.
  const odd = parseCallback(
    "https://jobbflow.test/auth/callback?token_hash=xyz&type=nonsense",
  );
  assert.equal(odd.kind === "verify" && odd.type, "email");
});

test("links already in inboxes keep working and failures reach a real page", () => {
  const legacy = parseCallback("https://jobbflow.test/auth/callback?code=pkce-code");
  assert.deepEqual(legacy, { kind: "exchange", code: "pkce-code", destination: "/app" });
  const legacyReset = parseCallback(
    "https://jobbflow.test/auth/callback?code=pkce-code&next=reset-password",
  );
  assert.equal(legacyReset.kind === "exchange" && legacyReset.destination, "/aterstall-losenord");

  assert.deepEqual(
    parseCallback(
      "https://jobbflow.test/auth/callback?error=access_denied&error_code=otp_expired",
    ),
    { kind: "failed", reason: "expired" },
  );
  assert.deepEqual(
    parseCallback("https://jobbflow.test/auth/callback?error=access_denied"),
    { kind: "failed", reason: "denied" },
  );
  assert.deepEqual(parseCallback("https://jobbflow.test/auth/callback"), {
    kind: "failed",
    reason: "missing",
  });
  assert.equal(failureRedirect("expired"), "/lankfel?orsak=expired");
});

test("an open redirect cannot be smuggled through the callback", () => {
  const plan = parseCallback(
    "https://jobbflow.test/auth/callback?token_hash=abc&type=email&next=https://evil.test",
  );
  assert.equal(plan.kind === "verify" && plan.destination, "/app");
  assert.equal(callbackDestination(null, "//evil.test"), "/app");
});

test("sign-in failures are told apart instead of collapsing into one message", () => {
  assert.equal(
    classifyAuthError(supabaseError("invalid_credentials", 400)),
    "AUTH_INVALID_CREDENTIALS",
  );
  assert.equal(
    classifyAuthError(supabaseError("", 400, "Invalid login credentials")),
    "AUTH_INVALID_CREDENTIALS",
  );
  assert.equal(
    classifyAuthError(supabaseError("email_not_confirmed", 400)),
    "AUTH_EMAIL_NOT_CONFIRMED",
  );
  assert.equal(
    classifyAuthError(supabaseError("over_email_send_rate_limit", 429)),
    "RATE_LIMITED",
  );
  assert.equal(classifyAuthError(supabaseError("", 429)), "RATE_LIMITED");
  assert.equal(classifyAuthError(supabaseError("weak_password", 422)), "AUTH_WEAK_PASSWORD");
  assert.equal(classifyAuthError(supabaseError("same_password", 422)), "AUTH_SAME_PASSWORD");
  assert.equal(classifyAuthError(supabaseError("otp_expired", 403)), "AUTH_LINK_EXPIRED");
  assert.equal(classifyAuthError(new Error("boom")), "AUTH_FAILED");
  assert.equal(classifyAuthError(undefined), "AUTH_FAILED");
});

test("no answer reveals whether an address is registered", () => {
  assert.equal(isSilentAuthError("signup", supabaseError("user_already_exists", 422)), true);
  assert.equal(
    isSilentAuthError("signup", supabaseError("", 400, "User already registered")),
    true,
  );
  assert.equal(isSilentAuthError("magic", supabaseError("otp_disabled", 422)), true);
  assert.equal(
    isSilentAuthError("magic", supabaseError("", 422, "Signups not allowed for otp")),
    true,
  );
  assert.equal(isSilentAuthError("recovery", supabaseError("user_not_found", 404)), true);
  // A wrong password is the candidate's own failure and must be reported.
  assert.equal(isSilentAuthError("login", supabaseError("invalid_credentials", 400)), false);
  // The wrong-credentials wording must not confirm or deny the account.
  const message = sv.auth.errors.AUTH_INVALID_CREDENTIALS.toLowerCase();
  for (const leak of ["finns inte", "okänd", "oregistrerad", "inget konto"])
    assert.equal(message.includes(leak), false, `leaks: ${leak}`);
});

test("API failures carry a code, a status and the field to mark", () => {
  const invalid = resolveError(new Error("AUTH_INVALID_CREDENTIALS"));
  assert.equal(invalid.status, 401);
  assert.equal(invalid.field, "password");
  assert.equal(invalid.message, sv.auth.errors.AUTH_INVALID_CREDENTIALS);

  const unconfirmed = resolveError(new Error("AUTH_EMAIL_NOT_CONFIRMED"));
  assert.equal(unconfirmed.status, 403);
  assert.equal(unconfirmed.field, "email");

  assert.equal(resolveError(new Error("RATE_LIMITED")).status, 429);
  assert.equal(resolveError(new Error("VERSION_CONFLICT")).status, 409);
  assert.equal(resolveError(new Error("SOURCES_UNAVAILABLE")).status, 502);
  assert.equal(resolveError(new Error("AUTH_NOT_CONFIGURED")).status, 503);
  assert.equal(resolveError(new Error("SERVICE_NOT_CONFIGURED")).status, 503);
  assert.equal(resolveError(new Error("something odd")).status, 400);
  assert.equal(resolveError(new Error("something odd")).code, "UNKNOWN");
  assert.equal(resolveError("not an error").message, sv.serverErrors.generic);
  // A thrown message must not reach Object.prototype.
  assert.equal(resolveError(new Error("toString")).status, 400);
  assert.equal(resolveError(new Error("constructor")).code, "UNKNOWN");
  // The three sign-in failures must not share one sentence.
  const texts = new Set(
    ["AUTH_INVALID_CREDENTIALS", "AUTH_EMAIL_NOT_CONFIRMED", "RATE_LIMITED"].map(
      (code) => resolveError(new Error(code)).message,
    ),
  );
  assert.equal(texts.size, 3);
});

test("the job search reads and writes its state through the URL", () => {
  assert.deepEqual(readSearchUrl({ q: "utvecklare" }), {
    query: "utvecklare",
    workStyle: "any",
  });
  assert.deepEqual(readSearchUrl({ q: "  sjuksköterska  ", arbetsform: "remote" }), {
    query: "sjuksköterska",
    workStyle: "remote",
  });
  // Repeated and unknown values must not reach the search untouched.
  assert.equal(readSearchUrl({ q: ["först", "sen"] }).query, "först");
  assert.equal(readSearchUrl({ arbetsform: "påhitt" }).workStyle, "any");
  assert.equal(readSearchUrl({}).query, "");
  assert.equal(readSearchUrl({ q: "x".repeat(400) }).query.length, QUERY_MAX);

  assert.equal(searchUrlQuery("", "any"), "");
  assert.equal(searchUrlQuery("utvecklare", "any"), "q=utvecklare");
  assert.equal(
    searchUrlQuery("utvecklare", "hybrid"),
    "q=utvecklare&arbetsform=hybrid",
  );
  // A shared link must reopen exactly the search it was made from.
  const state = { query: "HR Stockholm", workStyle: "onsite" as const };
  const round = readSearchUrl(
    Object.fromEntries(new URLSearchParams(searchUrlQuery(state.query, state.workStyle))),
  );
  assert.deepEqual(round, state);
});

test("the live check reports credentials without ever printing them", async () => {
  const { describeConnection, envReport, poolerWarnings } = await import(
    "../src/core/diagnostics.ts"
  );
  const url =
    "postgresql://postgres.project:Sup3rSecret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
  const described = describeConnection(url);
  assert.equal(described, "aws-0-eu-west-1.pooler.supabase.com:6543/postgres");
  assert.equal(described.includes("Sup3rSecret"), false);
  assert.equal(described.includes("postgres.project"), false);
  assert.equal(describeConnection("not a url"), "(unparseable connection string)");

  // src/server/db.ts sets prepare:false, which is only correct on the
  // transaction pooler; the session pooler on 5432 is a different contract.
  assert.deepEqual(poolerWarnings(url), []);
  assert.equal(poolerWarnings(url.replace(":6543", ":5432")).length, 1);
  assert.equal(
    poolerWarnings("postgresql://u:p@db.project.supabase.co:5432/postgres").length,
    1,
  );
  assert.deepEqual(poolerWarnings("nonsense"), ["DATABASE_URL is not a valid URL."]);

  const report = envReport({ DATABASE_URL: url, APP_BASE_URL: "" });
  assert.deepEqual(report.missing, [
    "APP_BASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  // The report carries names and presence, never a value.
  assert.equal(JSON.stringify(report).includes("Sup3rSecret"), false);
  assert.deepEqual(
    report.required.find((entry) => entry.name === "DATABASE_URL"),
    { name: "DATABASE_URL", present: true },
  );
});
