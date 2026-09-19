import { createHash } from "node:crypto";
import {
  FactorSchema,
  type FactorKey,
  type Candidate,
  type Job,
  type Preferences,
} from "./contracts.ts";
import type { z } from "zod";

export const WEIGHTS: Record<FactorKey, number> = {
  role: 20,
  skills: 20,
  experience: 15,
  seniority: 10,
  industry: 5,
  location: 10,
  workStyle: 5,
  employment: 5,
  language: 5,
  education: 3,
  management: 1,
  salary: 1,
};
export const MATCH_VERSION = "evidence-v1";
const norm = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("sv-SE").trim().replace(/\s+/g, " ");

export function scoreFactors(raw: unknown[], candidate: Candidate) {
  const factors = raw.map((x) => FactorSchema.parse(x));
  if (new Set(factors.map((f) => f.key)).size !== factors.length)
    throw new Error("Duplicate factor");
  const facts = new Set(
    candidate.facts.filter((f) => f.confirmed).map((f) => f.id),
  );
  for (const factor of factors) {
    if (factor.evidenceIds.some((id) => !facts.has(id)))
      throw new Error("Unconfirmed evidence");
    if (
      factor.source === "ai" &&
      factor.value !== null &&
      !factor.evidenceIds.length
    )
      throw new Error("AI factor requires evidence");
    if (factor.source === "unknown" && factor.value !== null)
      throw new Error("Unknown factor cannot be scored");
    if (
      factor.blocker &&
      (factor.value === null || factor.source === "unknown")
    )
      throw new Error("Unknown requirement cannot be a blocker");
  }
  const known = factors.filter((f) => f.value !== null);
  const coverage = known.reduce((n, f) => n + WEIGHTS[f.key], 0);
  const blockers = known.filter((f) => f.blocker);
  const score =
    coverage >= 50
      ? Math.round(
          (known.reduce((n, f) => n + WEIGHTS[f.key] * f.value!, 0) /
            coverage) *
            100,
        )
      : null;
  return {
    score,
    coverage,
    confidence: coverage >= 85 ? "high" : coverage >= 65 ? "medium" : "low",
    strong: score !== null && score >= 80 && coverage >= 65 && !blockers.length,
    blockers,
    factors,
    version: MATCH_VERSION,
  };
}

export function filterJob(
  job: Job,
  p: Preferences,
  now = new Date(),
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (job.removed) reasons.push("removed");
  if (job.deadline && Date.parse(job.deadline) < now.getTime())
    reasons.push("expired");
  if (p.excludedTitles.some((t) => norm(job.title).includes(norm(t))))
    reasons.push("excluded_title");
  if (
    job.employer &&
    p.excludedCompanies.some((c) => norm(c) === norm(job.employer!))
  )
    reasons.push("excluded_company");
  if (
    p.workStyle !== "any" &&
    job.workStyle !== "unknown" &&
    p.workStyle !== job.workStyle
  )
    reasons.push("work_style");
  if (
    p.locations.length &&
    !p.willingToRelocate &&
    job.workStyle !== "remote" &&
    job.location &&
    !p.locations.some((l) => norm(l) === norm(job.location!))
  )
    reasons.push("location");
  if (
    p.employment.length &&
    job.employment &&
    !p.employment.includes(job.employment)
  )
    reasons.push("employment");
  if (
    p.minimumSalary !== null &&
    job.salaryMaximumSek !== null &&
    job.salaryMaximumSek < p.minimumSalary
  )
    reasons.push("salary");
  return { eligible: !reasons.length, reasons };
}

export function canonicalUrl(raw: string) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Unsafe URL");
  u.hash = "";
  for (const k of [...u.searchParams.keys()])
    if (/^utm_|^(gclid|fbclid)$/.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.toString();
}
export function deduplicate(jobs: Job[]) {
  const kept: Job[] = [];
  const aliases: Record<string, string> = {};
  const exact = new Map<string, Job>();
  for (const job of jobs) {
    const keys = [
      `${job.source}:${job.externalId}`,
      canonicalUrl(job.canonicalUrl),
    ];
    const existing = keys.map((k) => exact.get(k)).find(Boolean);
    if (existing) {
      aliases[job.id] = existing.id;
      keys.forEach((k) => exact.set(k, existing));
      continue;
    }
    kept.push(job);
    keys.forEach((k) => exact.set(k, job));
  }
  return { jobs: kept, aliases };
}
export function possibleDuplicateKey(j: Job) {
  return createHash("sha256")
    .update(
      [j.employer, j.title, j.location, j.publishedAt.slice(0, 10)]
        .map((x) => norm(x ?? ""))
        .join("|"),
    )
    .digest("hex");
}
export function shortlist(jobs: Job[], candidate: Candidate, limit = 25) {
  const result = deduplicate(jobs).jobs.filter(
    (j) => filterJob(j, candidate.preferences).eligible,
  );
  const occupations = new Set(candidate.preferences.occupationIds);
  return result
    .map((job) => ({
      job,
      retrievalScore:
        job.occupationIds.filter((id) => occupations.has(id)).length * 10 +
        candidate.preferences.roles.filter((role) =>
          norm(job.title).includes(norm(role)),
        ).length *
          2,
    }))
    .sort(
      (a, b) =>
        b.retrievalScore - a.retrievalScore ||
        Date.parse(b.job.publishedAt) - Date.parse(a.job.publishedAt),
    )
    .slice(0, Math.max(0, Math.min(limit, 100)));
}
