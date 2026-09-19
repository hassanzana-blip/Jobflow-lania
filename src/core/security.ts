export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export function validateUpload(bytes: Uint8Array, mime: string, name: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new Error("INVALID_FILE_SIZE");
  const pdf =
    mime === "application/pdf" &&
    /\.pdf$/i.test(name) &&
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  const docx =
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    /\.docx$/i.test(name) &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  if (!pdf && !docx) throw new Error("INVALID_FILE_TYPE");
  return {
    kind: pdf ? "pdf" : "docx",
    needsMalwareScan: true,
    needsArchiveValidation: docx,
  } as const;
}
export function assertSameOrigin(request: Request, baseUrl: string) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(baseUrl).origin)
    throw new Error("INVALID_ORIGIN");
}
export const ANALYTICS_EVENTS = [
  "signup_started",
  "signup_completed",
  "cv_uploaded",
  "cv_parsed",
  "candidate_confirmed",
  "search_run",
  "jobs_retrieved",
  "strong_match_created",
  "job_opened",
  "job_saved",
  "job_dismissed",
  "application_prepare_started",
  "application_draft_created",
  "application_reviewed",
  "agent_started",
  "application_approved",
  "application_marked_applied",
  "subscription_started",
  "subscription_upgraded",
  "subscription_cancelled",
] as const;
export function analyticsPayload(
  event: string,
  properties: Record<string, unknown>,
) {
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(event))
    throw new Error("UNKNOWN_EVENT");
  const clean: Record<string, string | number | boolean> = {};
  for (const key of ["count", "duration_ms", "success"]) {
    const v = properties[key];
    if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean")
      clean[key] = v;
  }
  const plan = properties.plan;
  if (
    typeof plan === "string" &&
    ["free", "plus", "pro", "agent"].includes(plan)
  )
    clean.plan = plan;
  return { event, properties: clean };
}
