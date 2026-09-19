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
import { deduplicate, filterJob } from "@/core/matching";

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
    sql`select * from profiles where user_id=${uid} and state='active'`,
    sql`select * from candidate_preferences where user_id=${uid}`,
    sql`select f.* from candidate_facts f join profiles p on p.user_id=f.user_id and p.version=f.profile_version where f.user_id=${uid} order by f.created_at,f.id`,
    sql`select distinct j.* from jobs j where j.id in (select job_id from job_matches where user_id=${uid} union select job_id from saved_jobs where user_id=${uid} union select job_id from applications where user_id=${uid}) order by j.published_at desc limit 150`,
    sql`select job_id from saved_jobs where user_id=${uid}`,
    sql`select job_id from dismissed_jobs where user_id=${uid}`,
    sql`select a.*,d.cv_version_id,v.content,v.reviewed_at from applications a left join application_documents d on d.application_id=a.id and d.user_id=a.user_id and d.kind='tailored_cv' left join cv_versions v on v.id=d.cv_version_id and v.user_id=a.user_id where a.user_id=${uid} order by a.updated_at desc limit 200`,
    sql`select new_matches from notification_settings where user_id=${uid}`,
    sql`select created_at,source_status from search_runs where user_id=${uid} order by created_at desc limit 1`,
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
    jobs: jobs.map((j) => ({
      ...jobFromRow(j),
      score: null,
      coverage: 0,
      matchKind: "retrieved" as const,
      reasons: retrievalReasons(jobFromRow(j), prefs),
      gaps: [],
    })),
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
      cvUpload: false,
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
  input: { query: string; preferences: typeof emptyPreferences },
) {
  const sql = database();
  const result = await retrieve({
    query: input.query,
    occupationIds: input.preferences.occupationIds,
    municipalityIds: [],
  });
  if (result.sources.every((s) => s.status === "unavailable"))
    throw new Error("SOURCES_UNAVAILABLE");
  const unique = deduplicate(result.jobs)
    .jobs.filter((j) => filterJob(j, input.preferences).eligible)
    .slice(0, 100);
  const rows: WorkspaceJob[] = [];
  await sql.begin(async (tx) => {
    const [p] =
      await tx`select version from profiles where user_id=${uid} and state='active' for update`;
    if (!p) throw new Error("ACCOUNT_NOT_ACTIVE");
    for (const j of unique) {
      const [saved] =
        await tx`insert into jobs(source_id,external_id,title,employer_label,canonical_url,source_url,location,municipality_id,occupation_ids,employment_type,work_style,published_at,deadline,removed_at,description,description_completeness,fetched_at)
      values(${j.source},${j.externalId},${j.title},${j.employer},${j.canonicalUrl},${j.sourceUrl},${j.location},${j.municipalityId},${tx.array(j.occupationIds)},${j.employment},${j.workStyle},${j.publishedAt},${j.deadline},null,${j.description},${j.descriptionCompleteness},now())
      on conflict(source_id,external_id) do update set title=excluded.title,employer_label=excluded.employer_label,description=excluded.description,source_url=excluded.source_url,location=excluded.location,work_style=excluded.work_style,deadline=excluded.deadline,removed_at=null,fetched_at=now() returning id`;
      await tx`insert into job_matches(user_id,job_id,profile_version,method_version,score,coverage,summary) values(${uid},${saved.id},${p.version},'retrieval-v1',null,0,'Sökresultat, inte en djupanalys') on conflict do nothing`;
      rows.push({
        ...j,
        id: saved.id,
        score: null,
        coverage: 0,
        matchKind: "retrieved",
        reasons: retrievalReasons(j, input.preferences),
        gaps: [],
      });
    }
    await tx`insert into search_runs(id,user_id,retrieved,retained,source_status) values(${randomUUID()},${uid},${result.jobs.length},${rows.length},${tx.json(result.sources)})`;
  });
  return {
    jobs: rows,
    sources: result.sources,
    lastSearchAt: new Date().toISOString(),
  };
}
