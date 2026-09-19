import { createHash, timingSafeEqual } from "node:crypto";

export type ApplicationPayload = {
  userId: string;
  jobId: string;
  destination: string;
  profileVersion: number;
  documents: { id: string; sha256: string }[];
  answers: Record<string, string>;
};
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
      .join(",") +
    "}"
  );
}
export function payloadHash(payload: ApplicationPayload) {
  return createHash("sha256").update(stable(payload)).digest("hex");
}
export type Approval = {
  userId: string;
  payloadHash: string;
  expiresAt: string;
  consumedAt: string | null;
};
export function verifyApproval(
  approval: Approval,
  payload: ApplicationPayload,
  now = new Date(),
) {
  if (
    approval.userId !== payload.userId ||
    approval.consumedAt ||
    !Number.isFinite(Date.parse(approval.expiresAt)) ||
    Date.parse(approval.expiresAt) <= now.getTime()
  )
    return false;
  const a = Buffer.from(approval.payloadHash, "hex"),
    b = Buffer.from(payloadHash(payload), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export const APPLICATION_STATUSES = [
  "saved",
  "preparing",
  "ready",
  "applied",
  "interview",
  "offer",
  "rejected",
  "archived",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export function canTransition(from: ApplicationStatus, to: ApplicationStatus) {
  const allowed: Record<ApplicationStatus, ApplicationStatus[]> = {
    saved: ["preparing", "archived"],
    preparing: ["ready", "saved", "archived"],
    ready: ["preparing", "applied", "archived"],
    applied: ["interview", "offer", "rejected", "archived"],
    interview: ["offer", "rejected", "archived"],
    offer: ["archived"],
    rejected: ["archived"],
    archived: ["saved"],
  };
  return allowed[from].includes(to);
}
