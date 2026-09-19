import { sv } from "../i18n/sv.ts";
/**
 * Every failure the API returns is one of these codes. The client needs the
 * code (to mark the right field) and a Swedish sentence that says what to do,
 * so both travel in the body; copy itself stays in `src/i18n`.
 */
const RESPONSES: Record<string, { status: number; message: string; field?: "email" | "password" }> = {
  AUTH_INVALID_CREDENTIALS: {
    status: 401,
    message: sv.auth.errors.AUTH_INVALID_CREDENTIALS,
    field: "password",
  },
  AUTH_EMAIL_NOT_CONFIRMED: {
    status: 403,
    message: sv.auth.errors.AUTH_EMAIL_NOT_CONFIRMED,
    field: "email",
  },
  AUTH_WEAK_PASSWORD: {
    status: 400,
    message: sv.auth.errors.AUTH_WEAK_PASSWORD,
    field: "password",
  },
  AUTH_SAME_PASSWORD: {
    status: 400,
    message: sv.auth.errors.AUTH_SAME_PASSWORD,
    field: "password",
  },
  AUTH_LINK_EXPIRED: { status: 400, message: sv.auth.errors.AUTH_LINK_EXPIRED },
  AUTH_LINK_INVALID: { status: 400, message: sv.auth.errors.AUTH_LINK_INVALID },
  AUTH_FAILED: { status: 400, message: sv.auth.errors.AUTH_FAILED },
  PASSWORD_REQUIRED: {
    status: 400,
    message: sv.serverErrors.passwordRequired,
    field: "password",
  },
  CONSENT_REQUIRED: { status: 400, message: sv.serverErrors.consentRequired },
  RATE_LIMITED: { status: 429, message: sv.auth.errors.RATE_LIMITED },
  VERSION_CONFLICT: { status: 409, message: sv.serverErrors.conflict },
  NOT_FOUND: { status: 404, message: sv.serverErrors.generic },
  SOURCES_UNAVAILABLE: { status: 502, message: sv.serverErrors.sources },
  UNAUTHENTICATED: { status: 401, message: sv.serverErrors.unauthenticated },
  ACCOUNT_NOT_ACTIVE: { status: 403, message: sv.serverErrors.unauthenticated },
  INVALID_ORIGIN: { status: 403, message: sv.serverErrors.generic },
  INVALID_FILE_SIZE: { status: 413, message: sv.serverErrors.fileTooLarge },
  INVALID_FILE_TYPE: { status: 415, message: sv.serverErrors.fileType },
  FILE_REJECTED: { status: 422, message: sv.serverErrors.fileRejected },
  DOCUMENT_QUARANTINED: { status: 409, message: sv.serverErrors.documentQuarantined },
  STORAGE_UNAVAILABLE: { status: 503, message: sv.serverErrors.storageUnavailable },
  PROFILE_UNCONFIRMED: { status: 409, message: sv.serverErrors.profileUnconfirmed },
  BODY_REQUIRED: { status: 400, message: sv.serverErrors.fileType },
};

export function resolveError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  // `hasOwn`, not a plain lookup: the code comes from a thrown message, and
  // "toString" or "constructor" would otherwise resolve on Object.prototype.
  if (Object.hasOwn(RESPONSES, code)) return { code, ...RESPONSES[code] };
  if (code.includes("NOT_CONFIGURED"))
    return { code, status: 503, message: sv.serverErrors.unconfigured };
  return { code: "UNKNOWN", status: 400, message: sv.serverErrors.generic };
}
