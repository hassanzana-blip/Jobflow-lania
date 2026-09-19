/**
 * The contract between the isolated parser process and the server that spawns
 * it. Both sides import this, so a new failure mode cannot be introduced on one
 * side and silently ignored on the other.
 *
 * Every failure is named. A CV that cannot be read is a normal thing to happen
 * — an exported-as-image scan, a password on the file, a truncated download —
 * and the candidate is owed a specific sentence about which one it was, not a
 * spinner that never finishes or an empty profile that looks like their fault.
 */
export type ParseFailure =
  | "ENCRYPTED"
  | "NO_TEXT_LAYER"
  | "CORRUPT"
  | "UNSAFE_ARCHIVE"
  | "TIMEOUT"
  | "PARSER_FAILED";

/** Matches the provider's own document limit, so extraction cannot exceed it. */
export const MAX_TEXT_CHARS = 80_000;

/** Below this, a PDF has effectively no selectable text: a scan, not a document. */
export const MIN_TEXT_CHARS = 40;

export type ParseResult =
  | { ok: true; text: string; pages: number | null; truncated: boolean }
  | { ok: false; reason: ParseFailure };

export const PARSE_FAILURES: readonly ParseFailure[] = [
  "ENCRYPTED",
  "NO_TEXT_LAYER",
  "CORRUPT",
  "UNSAFE_ARCHIVE",
  "TIMEOUT",
  "PARSER_FAILED",
];

/** Whether trying the same file again could plausibly give a different answer. */
export function isRetryable(reason: ParseFailure) {
  return reason === "TIMEOUT" || reason === "PARSER_FAILED";
}

/**
 * Normalises extracted text before it is shown or sent anywhere: collapses the
 * ragged whitespace a PDF text layer produces, drops control characters, and
 * enforces the length cap. `truncated` is surfaced so the candidate is told
 * their document was cut rather than quietly losing its last pages.
 */
export function normaliseText(raw: string) {
  const cleaned = raw
    // Control characters other than tab and newline carry no meaning here and
    // would otherwise travel into a prompt and into the database.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: cleaned.slice(0, MAX_TEXT_CHARS),
    truncated: cleaned.length > MAX_TEXT_CHARS,
  };
}

/** Turns whatever the parser threw into one of the named failures. */
export function classifyParseError(error: unknown): ParseFailure {
  const name = (error as { name?: unknown })?.name;
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  if (name === "PasswordException" || /password/i.test(message)) return "ENCRYPTED";
  if (name === "DocxError") {
    const reason = (error as { reason?: string }).reason;
    if (reason === "ARCHIVE_ENCRYPTED") return "ENCRYPTED";
    if (reason === "ARCHIVE_UNSAFE") return "UNSAFE_ARCHIVE";
    return "CORRUPT";
  }
  if (name === "InvalidPDFException" || /invalid pdf|corrupt|unexpected end/i.test(message))
    return "CORRUPT";
  return "PARSER_FAILED";
}

/** Reads the parser process's stdout without trusting its shape. */
export function readParserOutput(stdout: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return { ok: false, reason: "PARSER_FAILED" };
  }
  const result = value as Partial<ParseResult> & { reason?: unknown; text?: unknown };
  if (result?.ok === true && typeof result.text === "string") {
    const { text, truncated } = normaliseText(result.text);
    const pages = (result as { pages?: unknown }).pages;
    return {
      ok: true,
      text,
      pages: typeof pages === "number" && Number.isFinite(pages) ? pages : null,
      truncated,
    };
  }
  const reason = typeof result?.reason === "string" ? result.reason : "";
  return {
    ok: false,
    reason: PARSE_FAILURES.includes(reason as ParseFailure)
      ? (reason as ParseFailure)
      : "PARSER_FAILED",
  };
}
