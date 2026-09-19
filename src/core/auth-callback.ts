/**
 * `/auth/callback` handles two link shapes.
 *
 * `token_hash` + `type` is Supabase's server-side verification flow: the token
 * travels in the link and is redeemed with `verifyOtp`, so the link works in a
 * browser that never saw the request. `code` is the PKCE flow, where the
 * `code_verifier` cookie only exists in the browser that asked for the link —
 * opening such a link on a phone after requesting it on a laptop can never
 * succeed. Templates now emit `token_hash`; `code` stays supported so links
 * already sitting in inboxes keep working.
 *
 * Parsing is separated from redemption so the routing decisions — which OTP
 * type, where to land, which failure to show — are testable without a network.
 */
export type EmailOtpType = "email" | "signup" | "magiclink" | "recovery" | "invite" | "email_change";
export type CallbackFailure = "expired" | "invalid" | "missing" | "denied";

export type CallbackPlan =
  | { kind: "verify"; tokenHash: string; type: EmailOtpType; destination: string }
  | { kind: "exchange"; code: string; destination: string }
  | { kind: "failed"; reason: CallbackFailure };

const OTP_TYPES: readonly EmailOtpType[] = [
  "email",
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
];

/** The only `next` value we honour; anything else is ignored to avoid open redirects. */
const RESET = "reset-password";

export function callbackDestination(type: EmailOtpType | null, next: string | null) {
  return type === "recovery" || next === RESET ? "/aterstall-losenord" : "/app";
}

export function parseCallback(url: string): CallbackPlan {
  const params = new URL(url).searchParams;
  const next = params.get("next");

  // Supabase redirects here with an error when the link itself was rejected
  // (already used, expired) before any token could be handed over.
  const errorCode = params.get("error_code") ?? params.get("error");
  if (errorCode)
    return { kind: "failed", reason: errorCode.includes("expired") ? "expired" : "denied" };

  const tokenHash = params.get("token_hash");
  if (tokenHash) {
    const raw = params.get("type");
    const type = OTP_TYPES.includes(raw as EmailOtpType)
      ? (raw as EmailOtpType)
      : next === RESET
        ? "recovery"
        : "email";
    return { kind: "verify", tokenHash, type, destination: callbackDestination(type, next) };
  }

  const code = params.get("code");
  if (code) return { kind: "exchange", code, destination: callbackDestination(null, next) };

  return { kind: "failed", reason: "missing" };
}

/** Where a failed callback sends the candidate, carrying the reason for the copy. */
export function failureRedirect(reason: CallbackFailure) {
  return `/lankfel?orsak=${reason}`;
}
