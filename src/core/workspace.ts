import { z } from "zod";
import { PreferencesSchema, FactSchema, JobSchema } from "./contracts.ts";

export const ApplicationStatusSchema = z.enum([
  "saved",
  "preparing",
  "ready",
  "applied",
  "interview",
  "offer",
  "rejected",
  "archived",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;
export const ProfileInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(150),
    location: z.string().trim().max(150),
    expectedVersion: z.number().int().positive(),
    confirmed: z.literal(true),
    facts: z
      .array(
        // `grounded` says the quote was verified against the uploaded document.
        // The server re-derives it from the stored review, so a client claiming
        // it changes nothing; it travels here only to keep the shape whole.
        FactSchema.extend({ grounded: z.boolean().optional() }),
      )
      .min(1)
      .max(100),
    preferences: PreferencesSchema,
    /** Set when these facts came from reviewing a CV, so it can be closed. */
    extractionId: z.uuid().optional(),
  })
  .strict();
export const ApplicationUpdateSchema = z
  .object({
    id: z.uuid(),
    status: ApplicationStatusSchema,
    notes: z.string().max(10000),
    interviewAt: z.string().datetime().nullable(),
    followUpAt: z.string().datetime().nullable(),
    expectedUpdatedAt: z.string(),
  })
  .strict();
export const JobActionSchema = z
  .object({
    jobId: z.uuid(),
    action: z.enum(["save", "unsave", "dismiss", "restore"]),
  })
  .strict();
export const WorkspaceJobSchema = JobSchema.extend({
  reasons: z.array(z.string()),
  gaps: z.array(z.string()),
  score: z.number().nullable(),
  coverage: z.number(),
  matchKind: z.enum(["analysed", "retrieved", "example"]),
});
export type WorkspaceJob = z.infer<typeof WorkspaceJobSchema>;
export type WorkspaceProfile = {
  displayName: string;
  location: string;
  version: number;
  confirmed: boolean;
  facts: z.infer<typeof FactSchema>[];
  preferences: z.infer<typeof PreferencesSchema>;
};
export type Application = {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  notes: string;
  interviewAt: string | null;
  followUpAt: string | null;
  updatedAt: string;
  documentId: string | null;
  draftText: string | null;
  reviewed: boolean;
};
export type WorkspaceData = {
  profile: WorkspaceProfile;
  jobs: WorkspaceJob[];
  saved: string[];
  dismissed: string[];
  applications: Application[];
  sources: { source: string; status: string }[];
  lastSearchAt: string | null;
  notifications: boolean;
  capabilities: {
    ai: boolean;
    cvUpload: boolean;
    billing: boolean;
    deletion: boolean;
  };
};
export const emptyPreferences: WorkspaceProfile["preferences"] = {
  roles: [],
  occupationIds: [],
  locations: [],
  workStyle: "any",
  employment: [],
  minimumSalary: null,
  excludedTitles: [],
  excludedCompanies: [],
  willingToRelocate: false,
  languages: [],
};
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toLocaleUpperCase("sv-SE") || "JF"
  );
}
export function isExpired(
  job: Pick<WorkspaceJob, "deadline" | "removed">,
  now = Date.now(),
) {
  return (
    job.removed || (job.deadline !== null && Date.parse(job.deadline) < now)
  );
}
export function filterWorkspaceJobs(
  jobs: WorkspaceJob[],
  input: {
    savedOnly: boolean;
    saved: string[];
    dismissed: string[];
    workStyle: string;
    query: string;
  },
) {
  const q = input.query.trim().toLocaleLowerCase("sv-SE");
  return jobs.filter(
    (j) =>
      !input.dismissed.includes(j.id) &&
      (!input.savedOnly || input.saved.includes(j.id)) &&
      (input.workStyle === "any" || j.workStyle === input.workStyle) &&
      (!q ||
        [j.title, j.employer, j.location]
          .join(" ")
          .toLocaleLowerCase("sv-SE")
          .includes(q)),
  );
}
