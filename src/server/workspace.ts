import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "./db";
import { requireUser } from "./supabase";
import { PreferencesSchema, JobSchema, type Job } from "@/core/contracts";
import {
  emptyPreferences,
  type WorkspaceData,
  type WorkspaceJob,
} from "@/core/workspace";
import { retrieve } from "@/core/sources";
import { MATCH_VERSION } from "@/core/matching";
import { planSearch, ANALYSIS_BUDGET_PER_SEARCH } from "@/core/pipeline";
import { analyseJobs, withAnalysis } from "./analysis";
import { MuseProvider, type ModelMetric } from "@/core/muse";
import { CandidateSchema } from "@/core/contracts";

type Row = Record<string, any>;
export function jobFromRow(j: Row): Job {
  return JobSchema.parse({
    id: j.id,
    source: j.source_id,
    externalId: j.external_id,
    canonicalUrl: j.canonical_url,
    sourceUrl: j.source_url,
    title: j.title,
    employer: j.employer_label,
    location: j.location,
    municipalityId: j.municipality_id,
    occupationIds: j.occupation_ids,
    publishedAt: new Date(j.published_at).toISOString(),
    deadline: j.deadline ? new Date(j.deadline).toISOString() : null,
    removed: Boolean(j.removed_at),
    description: j.description,
    descriptionCompleteness: j.description_completeness,
    workStyle: j.work_style ?? "unknown",
    employment: j.employment_type,
    salaryMaximumSek: j.salary_max,
  });
}
export async function loadWorkspace(): Promise<WorkspaceData> {
  const { user } = await requireUser();
  const sql = database(),
    uid = user.id;
  const [
    profiles,
    preferences,
    facts,
    jobs,
    saved,
    dismissed,
    apps,
    settings,
    runs,
  ] = await Promise.all([
    sql`select * from jobbflow.profiles where user_id=${uid} and state='active'`,
    sql`select * from jobbflow.candidate_preferences where user_id=${uid}`,
    sql`select f.* from jobbflow.candidate_facts f join jobbflow.profiles p on p.user_id=f.user_id and p.version=f.profile_version where f.user_id=${uid} order by f.created_at,f.id`,
    // A deep analysis is carried forward only while it still describes the
    // profile it was made against: confirming a new version does not leave old
    // scores standing as if they were current.
    sql`select j.*, m.score, m.coverage, m.summary, m.gaps, coalesce(mf.reasons,'{}') as match_reasons
        from jobbflow.jobs j
        left join jobbflow.job_matches m
          on m.job_id=j.id and m.user_id=${uid} and m.method_version=${MATCH_VERSION}
          and m.profile_version=(select version from jobbflow.profiles where user_id=${uid})
        left join lateral (
          select array_agg(f.reason order by f.value desc nulls last) as reasons
          from jobbflow.match_factors f
          where f.match_id=m.id and f.user_id=${uid} and f.value>=0.6 and cardinality(f.evidence_ids)>0
        ) mf on true
        where j.id in (select job_id from jobbflow.job_matches where user_id=${uid} union select job_id from jobbflow.saved_jobs where user_id=${uid} union select job_id from jobbflow.applications where user_id=${uid})
        order by m.score desc nulls last, j.published_at desc limit 150`,
    sql`select job_id from jobbflow.saved_jobs where user_id=${uid}`,
    sql`select job_id from jobbflow.dismissed_jobs where user_id=${uid}`,
    sql`select a.*,d.cv_version_id,v.content,v.reviewed_at from jobbflow.applications a left join jobbflow.application_documents d on d.application_id=a.id and d.user_id=a.user_id and d.kind='tailored_cv' left join jobbflow.cv_versions v on v.id=d.cv_version_id and v.user_id=a.user_id where a.user_id=${uid} order by a.updated_at desc limit 200`,
    sql`select new_matches from jobbflow.notification_settings where user_id=${uid}`,
    sql`select created_at,source_status from jobbflow.search_runs where user_id=${uid} order by created_at desc limit 1`,
  ]);
  const profile = profiles[0];
  if (!profile) throw new Error("ACCOUNT_NOT_ACTIVE");
  const p = preferences[0];
  const prefs = p
    ? PreferencesSchema.parse({
        roles: p.roles,
        occupationIds: p.occupation_ids,
        locations: p.locations,
        workStyle: p.work_style,
        employment: p.employment,
        minimumSalary: p.minimum_salary,
        excludedTitles: p.excluded_titles,
        excludedCompanies: p.excluded_companies,
        willingToRelocate: p.willing_to_relocate,
        languages: p.languages,
      })
    : emptyPreferences;
  return {
    profile: {
      displayName: profile.display_name ?? "",
      location: profile.location ?? "",
      version: profile.version,
      confirmed: Boolean(profile.confirmed_at),
      facts: facts.map((f) => ({
        id: f.id,
        kind: f.kind,
        text: f.fact,
        sourceQuote: f.source_quote ?? "",
        confirmed: f.confirmed,
      })),
      preferences: prefs,
    },
    jobs: jobs.map((j) => {
      const job = jobFromRow(j);
      const analysed = j.score !== null || j.summary !== null;
      const reasons: string[] = Array.isArray(j.match_reasons) ? j.match_reasons : [];
      return {
        ...job,
        score: j.score ?? null,
        coverage: j.coverage ?? 0,
        matchKind: analysed ? ("analysed" as const) : ("retrieved" as const),
        // A retrieval reason explains why the ad showed up; an analysed one
        // explains why it fits. Never both, so the two cannot be confused.
        reasons: analysed && reasons.length ? reasons : retrievalReasons(job, prefs),
        gaps: Array.isArray(j.gaps) ? (j.gaps as string[]) : [],
      };
    }),
    saved: saved.map((j) => j.job_id),
    dismissed: dismissed.map((j) => j.job_id),
    applications: apps.map((a) => ({
      id: a.id,
      jobId: a.job_id,
      status: a.status,
      notes: a.notes ?? "",
      interviewAt: a.interview_at?.toISOString() ?? null,
      followUpAt: a.follow_up_at?.toISOString() ?? null,
      updatedAt: a.updated_at.toISOString(),
      documentId: a.cv_version_id ?? null,
      draftText: a.content?.text ?? null,
      reviewed: Boolean(a.reviewed_at),
    })),
    sources: runs[0]?.source_status ?? [],
    lastSearchAt: runs[0]?.created_at.toISOString() ?? null,
    notifications: settings[0]?.new_matches ?? false,
    capabilities: {
      ai: Boolean(process.env.META_MODEL_API_KEY),
      // Uploading needs the private bucket, which needs the service role.
      // Parsing and the review work without a model key; only the proposals
      // depend on it, and the UI says so rather than pretending.
      cvUpload: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY &&
          process.env.NEXT_PUBLIC_SUPABASE_URL,
      ),
      billing: process.env.ENABLE_BILLING === "true",
      deletion: process.env.ENABLE_ACCOUNT_DELETION === "true",
    },
  };
}
function retrievalReasons(j: Job, p: typeof emptyPreferences) {
  const reasons: string[] = [];
  if (
    p.roles.some((r) =>
      j.title.toLocaleLowerCase("sv-SE").includes(r.toLocaleLowerCase("sv-SE")),
    )
  )
    reasons.push("Jobbtiteln finns bland dina önskemål");
  if (
    j.location &&
    p.locations.some(
      (l) =>
        l.toLocaleLowerCase("sv-SE") === j.location!.toLocaleLowerCase("sv-SE"),
    )
  )
    reasons.push("På en plats där du vill arbeta");
  if (p.workStyle !== "any" && p.workStyle === j.workStyle)
    reasons.push("Arbetsformen passar dina önskemål");
  return reasons;
}
export async function searchForUser(
  uid: string,
  input: { query: string; profile: WorkspaceData["profile"] },
) {
  const sql = database();
  const preferences = input.profile.preferences;
  const result = await retrieve({
    query: input.query,
    occupationIds: preferences.occupationIds,
    municipalityIds: [],
  });
  if (result.sources.every((s) => s.status === "unavailable"))
    throw new Error("SOURCES_UNAVAILABLE");

  // The model is only ever shown what survives deduplication, the candidate's
  // own deterministic filters and the ranking — never the raw feed.
  const confirmedFacts = input.profile.facts.filter((f) => f.confirmed);
  const candidate = CandidateSchema.parse({
    id: uid,
    version: input.profile.version,
    confirmedAt: new Date().toISOString(),
    facts: confirmedFacts,
    preferences,
  });
  const plan = planSearch({
    retrieved: result.jobs,
    candidate,
    sources: result.sources,
  });

  const retained = [...plan.analyse, ...plan.retrievedOnly];
  const rows: WorkspaceJob[] = [];
  const analyseIds = new Set(plan.analyse.map((job) => job.id));
  const toAnalyse: Job[] = [];
  await sql.begin(async (tx) => {
    const [p] =
      await tx`select version from jobbflow.profiles where user_id=${uid} and state='active' for update`;
    if (!p) throw new Error("ACCOUNT_NOT_ACTIVE");
    for (const j of retained) {
      const [saved] =
        await tx`insert into jobbflow.jobs(source_id,external_id,title,employer_label,canonical_url,source_url,location,municipality_id,occupation_ids,employment_type,work_style,published_at,deadline,removed_at,description,description_completeness,fetched_at)
      values(${j.source},${j.externalId},${j.title},${j.employer},${j.canonicalUrl},${j.sourceUrl},${j.location},${j.municipalityId},${tx.array(j.occupationIds)},${j.employment},${j.workStyle},${j.publishedAt},${j.deadline},null,${j.description},${j.descriptionCompleteness},now())
      on conflict(source_id,external_id) do update set title=excluded.title,employer_label=excluded.employer_label,description=excluded.description,source_url=excluded.source_url,location=excluded.location,work_style=excluded.work_style,deadline=excluded.deadline,removed_at=null,fetched_at=now() returning id`;
      await tx`insert into jobbflow.job_matches(user_id,job_id,profile_version,method_version,score,coverage,summary) values(${uid},${saved.id},${p.version},'retrieval-v1',null,0,'Sökresultat, inte en djupanalys') on conflict do nothing`;
      // Stored ids, not upstream ids: the analysis and everything after it
      // refer to rows in this database.
      const stored = { ...j, id: saved.id };
      if (analyseIds.has(j.id)) toAnalyse.push(stored);
      rows.push({
        ...stored,
        score: null,
        coverage: 0,
        matchKind: "retrieved",
        reasons: retrievalReasons(j, preferences),
        gaps: [],
      });
    }
  });

  // Analysis runs outside the write transaction: it makes network calls, and
  // holding a row lock across them would block the candidate's other actions.
  const metrics: ModelMetric[] = [];
  let analysed = 0;
  let quotaExhausted = false;
  let jobs = rows;
  const key = process.env.META_MODEL_API_KEY;
  if (key && toAnalyse.length && input.profile.confirmed && confirmedFacts.length) {
    const provider = new MuseProvider({ key, observe: (m) => metrics.push(m) });
    try {
      const outcome = await analyseJobs({
        userId: uid,
        candidate,
        profileVersion: input.profile.version,
        jobs: toAnalyse,
        provider,
        metrics,
      });
      jobs = withAnalysis(rows, outcome);
      analysed = outcome.analysed.length;
      quotaExhausted = outcome.quotaExhausted;
    } finally {
      for (const m of metrics)
        await sql`insert into jobbflow.model_usage(operation,model,input_tokens,cached_tokens,output_tokens,latency_ms,success,estimated_usd) values(${m.operation},${m.model},${m.inputTokens},${m.cachedTokens},${m.outputTokens},${m.latencyMs},${m.success},${m.estimatedUsd})`;
    }
  }

  // Analysed jobs first, then the rest by the ranking the pipeline produced.
  jobs = [...jobs].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  await sql`insert into jobbflow.search_runs(id,user_id,retrieved,retained,analysed,analysis_skipped,source_status) values(${randomUUID()},${uid},${result.jobs.length},${rows.length},${analysed},${Math.max(0, rows.length - analysed)},${sql.json(result.sources)})`;
  return {
    jobs,
    sources: result.sources,
    lastSearchAt: new Date().toISOString(),
    analysis: {
      analysed,
      budget: ANALYSIS_BUDGET_PER_SEARCH,
      retained: rows.length,
      quotaExhausted,
      partial: plan.partial,
    },
  };
}
