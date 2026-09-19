/**
 * Supabase Auth failures arrive as `AuthApiError` with a stable `code`, an HTTP
 * `status` and a free-text English `message`. The UI needs precise Swedish
 * feedback, so the classification lives here: pure, testable and free of both
 * transport details and user-facing copy (that stays in `src/i18n`).
 *
 * Account enumeration is the constraint that shapes the design. Some failures
 * would reveal whether an address is registered, so they are never surfaced:
 * `isSilentAuthError` names them per flow, and callers then answer with the
 * same "check your email" response they send on success.
 */
export type AuthErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_EMAIL_NOT_CONFIRMED"
  | "AUTH_WEAK_PASSWORD"
  | "AUTH_SAME_PASSWORD"
  | "AUTH_LINK_EXPIRED"
  | "AUTH_LINK_INVALID"
  | "RATE_LIMITED"
  | "AUTH_FAILED";

export type AuthFlow = "signup" | "login" | "magic" | "recovery" | "update-password";

/** Supabase error codes that would leak whether an address exists, per flow. */
const SILENT: Record<AuthFlow, readonly string[]> = {
  signup: ["user_already_exists", "email_exists"],
  magic: ["otp_disabled", "signup_disabled", "user_not_found"],
  recovery: ["user_not_found"],
  login: [],
  "update-password": [],
};

function detail(error: unknown) {
  const source = (error ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  return {
    code: typeof source.code === "string" ? source.code : "",
    status: typeof source.status === "number" ? source.status : 0,
    message: typeof source.message === "string" ? source.message.toLowerCase() : "",
  };
}

/**
 * True when the failure must be hidden behind the flow's success response.
 * Returning the same answer for "sent" and "no such account" is what keeps the
 * endpoint from confirming that an address is registered.
 */
export function isSilentAuthError(flow: AuthFlow, error: unknown) {
  const { code, message } = detail(error);
  if (SILENT[flow].includes(code)) return true;
  if (flow === "signup" && message.includes("already registered")) return true;
  if (flow === "magic" && message.includes("signups not allowed")) return true;
  return false;
}

export function classifyAuthError(error: unknown): AuthErrorCode {
  const { code, status, message } = detail(error);
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    status === 429
  )
    return "RATE_LIMITED";
  if (code === "email_not_confirmed" || code === "phone_not_confirmed")
    return "AUTH_EMAIL_NOT_CONFIRMED";
  if (code === "invalid_credentials" || message.includes("invalid login credentials"))
    return "AUTH_INVALID_CREDENTIALS";
  if (code === "weak_password") return "AUTH_WEAK_PASSWORD";
  if (code === "same_password") return "AUTH_SAME_PASSWORD";
  if (code === "otp_expired" || message.includes("expired")) return "AUTH_LINK_EXPIRED";
  if (code === "otp_disabled" || message.includes("token has invalid") || message.includes("invalid token"))
    return "AUTH_LINK_INVALID";
  // Supabase answers a wrong password with 400 and no code on older releases.
  if (status === 400 && message.includes("credentials")) return "AUTH_INVALID_CREDENTIALS";
  return "AUTH_FAILED";
}
