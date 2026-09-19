import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "./db";
import { analysisOperationId } from "@/core/pipeline";
import { MuseProvider, type ModelMetric } from "@/core/muse";
import { MATCH_VERSION, WEIGHTS } from "@/core/matching";
import type { Candidate, Job } from "@/core/contracts";
import type { WorkspaceJob } from "@/core/workspace";

/** Three at a time: fast enough to stay inside one request, gentle on the API. */
const CONCURRENCY = 3;

export type AnalysedJob = {
  jobId: string;
  score: number | null;
  coverage: number;
  summary: string;
  reasons: string[];
  gaps: string[];
};

export type AnalysisOutcome = {
  analysed: AnalysedJob[];
  /** Jobs the model was asked about but could not be scored; shown unscored. */
  failed: string[];
  /** True when the monthly allowance ran out part-way through. */
  quotaExhausted: boolean;
  metrics: ModelMetric[];
};

async function inBatches<T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  for (let at = 0; at < items.length; at += size)
    results.push(...(await Promise.all(items.slice(at, at + size).map(run))));
  return results;
}

/**
 * Scores a shortlist and records each result.
 *
 * Three things this is careful about:
 *
 *  - One job failing does not fail the search. A model answer citing a fact the
 *    candidate never confirmed is rejected by `scoreFactors`, and that job is
 *    simply shown unscored rather than taking the whole result set with it.
 *  - Quota is reserved per job under an id derived from the candidate, the job
 *    and their profile version, so a refresh or a retry reuses the reservation
 *    instead of spending the allowance twice. Running out stops the loop; it
 *    does not turn into an error page.
 *  - A reservation that does not produce a stored match is released, so a
 *    failed call never quietly costs the candidate a deep match.
 */
export async function analyseJobs(input: {
  userId: string;
  candidate: Candidate;
  profileVersion: number;
  jobs: Job[];
  provider: MuseProvider;
  metrics: ModelMetric[];
}): Promise<AnalysisOutcome> {
  const sql = database();
  const failed: string[] = [];
  let quotaExhausted = false;

  // Already scored for this profile version: no call, no quota, no wait.
  const existing = input.jobs.length
    ? await sql`
        select job_id,score,coverage,summary,gaps from jobbflow.job_matches
        where user_id=${input.userId} and profile_version=${input.profileVersion}
          and method_version=${MATCH_VERSION}
          and job_id in ${sql(input.jobs.map((job) => job.id))}`
    : [];
  const alreadyScored = new Map(existing.map((row) => [row.job_id as string, row]));

  const pending = input.jobs.filter((job) => !alreadyScored.has(job.id));
  const analysed: AnalysedJob[] = existing.map((row) => ({
    jobId: row.job_id,
    score: row.score,
    coverage: row.coverage,
    summary: row.summary ?? "",
    reasons: [],
    gaps: Array.isArray(row.gaps) ? (row.gaps as string[]) : [],
  }));

  const results = await inBatches(pending, CONCURRENCY, async (job) => {
    if (quotaExhausted) return null;
    const operation = analysisOperationId(input.userId, job.id, input.profileVersion);
    let reservation: string | null = null;
    try {
      const [reserved] =
        await sql`select jobbflow.reserve_usage(${input.userId},'deep_match',${operation}) as id`;
      reservation = reserved.id;
    } catch (error) {
      // The allowance is spent. Everything still queued stays unscored, and the
      // candidate is told how many were analysed rather than shown an error.
      if (String((error as Error)?.message ?? "").includes("QUOTA_EXCEEDED")) {
        quotaExhausted = true;
        return null;
      }
      throw error;
    }

    try {
      const match = await input.provider.scoreJob(input.candidate, job);
      const scored = await sql.begin(async (tx) => {
        const [row] = await tx`
          insert into jobbflow.job_matches
            (id,user_id,job_id,profile_version,method_version,score,coverage,summary,gaps)
          values (${randomUUID()},${input.userId},${job.id},${input.profileVersion},
            ${MATCH_VERSION},${match.score ?? null},${match.coverage},${match.summary},
            ${tx.json(match.gaps)})
          on conflict (user_id,job_id,profile_version,method_version) do update
            set score=excluded.score,coverage=excluded.coverage,summary=excluded.summary,
                gaps=excluded.gaps
          returning id`;
        for (const factor of match.factors)
          await tx`
            insert into jobbflow.match_factors
              (user_id,match_id,factor_key,value,weight,reason,evidence_ids,blocker)
            values (${input.userId},${row.id},${factor.key},${factor.value},
              ${WEIGHTS[factor.key]},${factor.reason},${tx.array(factor.evidenceIds)},${factor.blocker})
            on conflict (match_id,factor_key) do update
              set value=excluded.value,reason=excluded.reason,blocker=excluded.blocker`;
        await tx`update jobbflow.usage_events set state='settled' where id=${reservation} and user_id=${input.userId}`;
        return row.id as string;
      });
      if (!scored) throw new Error("MATCH_NOT_STORED");
      return {
        jobId: job.id,
        score: match.score,
        coverage: match.coverage,
        summary: match.summary,
        // Only factors with actual evidence become reasons the candidate sees.
        reasons: match.factors
          .filter((f) => f.value !== null && f.value >= 0.6 && f.evidenceIds.length)
          .map((f) => f.reason),
        gaps: match.gaps,
      } satisfies AnalysedJob;
    } catch {
      failed.push(job.id);
      if (reservation)
        await sql`update jobbflow.usage_events set state='released' where id=${reservation} and user_id=${input.userId} and state='reserved'`.catch(
          () => {},
        );
      return null;
    }
  });

  for (const result of results) if (result) analysed.push(result);
  return { analysed, failed, quotaExhausted, metrics: input.metrics };
}

/** Folds an analysis back onto the jobs the candidate will see. */
export function withAnalysis(
  jobs: WorkspaceJob[],
  outcome: Pick<AnalysisOutcome, "analysed">,
): WorkspaceJob[] {
  const byId = new Map(outcome.analysed.map((entry) => [entry.jobId, entry]));
  return jobs.map((job) => {
    const match = byId.get(job.id);
    if (!match) return job;
    return {
      ...job,
      score: match.score,
      coverage: match.coverage,
      matchKind: "analysed" as const,
      reasons: match.reasons.length ? match.reasons : job.reasons,
      gaps: match.gaps,
    };
  });
}
