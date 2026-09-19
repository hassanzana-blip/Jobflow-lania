import { createHash } from "node:crypto";
import { deduplicate, filterJob, shortlist } from "./matching.ts";
import type { Candidate, Job } from "./contracts.ts";

/**
 * Decides what happens to a set of retrieved job ads before any of them reaches
 * the model.
 *
 * The order is fixed and each step is cheap before the expensive one: retrieve,
 * deduplicate, filter deterministically against the candidate's own stated
 * requirements, rank what survives, and only then hand the top few to the
 * provider. Sending every ad would cost real money per search, burn a monthly
 * quota in one click, and produce worse answers than a ranked shortlist —
 * so the budget is a hard cap enforced here rather than a habit.
 *
 * Everything in this module is pure, so "the model never sees a job the
 * candidate ruled out" is a property a test can hold us to.
 */

/**
 * How many ads one search may analyse. Deliberately small: Free is 25 deep
 * matches a month, so a larger number would spend a third of it on one click,
 * and each call adds seconds the candidate waits.
 */
export const ANALYSIS_BUDGET_PER_SEARCH = 6;

/** Ads kept for display after filtering, analysed or not. */
export const MAX_RETAINED = 100;

export type PlannedSearch = {
  /** Ranked, capped, and the only jobs a provider is allowed to see. */
  analyse: Job[];
  /** Shown to the candidate with no score, never sent anywhere. */
  retrievedOnly: Job[];
  /** Why each rejected ad was dropped; kept for explaining an empty result. */
  rejected: { job: Job; reasons: string[] }[];
  counts: {
    retrieved: number;
    afterDeduplication: number;
    eligible: number;
    analyse: number;
  };
  /** At least one source did not answer, so the result is incomplete. */
  partial: boolean;
};

export function planSearch(input: {
  retrieved: Job[];
  candidate: Candidate;
  sources: { source: string; status: string }[];
  budget?: number;
  now?: Date;
}): PlannedSearch {
  const now = input.now ?? new Date();
  const budget = Math.max(
    0,
    Math.min(input.budget ?? ANALYSIS_BUDGET_PER_SEARCH, ANALYSIS_BUDGET_PER_SEARCH),
  );

  const unique = deduplicate(input.retrieved).jobs;
  const rejected: { job: Job; reasons: string[] }[] = [];
  const eligible: Job[] = [];
  for (const job of unique) {
    const verdict = filterJob(job, input.candidate.preferences, now);
    if (verdict.eligible) eligible.push(job);
    else rejected.push({ job, reasons: verdict.reasons });
  }

  // `shortlist` ranks by occupation and role overlap, then recency. It filters
  // again internally, which is harmless and keeps it usable on its own.
  const ranked = shortlist(eligible, input.candidate, MAX_RETAINED);
  const retained = ranked.map((entry) => entry.job).slice(0, MAX_RETAINED);
  const analyse = retained.slice(0, budget);
  const analyseIds = new Set(analyse.map((job) => job.id));

  return {
    analyse,
    retrievedOnly: retained.filter((job) => !analyseIds.has(job.id)),
    rejected,
    counts: {
      retrieved: input.retrieved.length,
      afterDeduplication: unique.length,
      eligible: eligible.length,
      analyse: analyse.length,
    },
    partial: input.sources.some((source) => source.status !== "ok"),
  };
}

/**
 * A stable id for "analysing this job, for this candidate, at this version of
 * their profile".
 *
 * `reserve_usage` is idempotent on it, so repeating a search — a refresh, a
 * retry after a timeout, two tabs — reuses the reservation instead of charging
 * the quota again. Confirming a new profile version changes the id, because
 * that genuinely is a different analysis.
 */
export function analysisOperationId(
  userId: string,
  jobId: string,
  profileVersion: number,
) {
  const digest = createHash("sha256")
    .update(`deep_match:${userId}:${jobId}:${profileVersion}`)
    .digest("hex");
  // Shaped as a UUID so it fits the uuid column; version and variant nibbles
  // are set so it is a well-formed v5-style identifier rather than a bare hash.
  const v = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${
    ((parseInt(digest.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
  }${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return v;
}
