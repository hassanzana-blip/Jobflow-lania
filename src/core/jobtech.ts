import { z } from "zod";
import { JobSchema, type Job, type JobSource } from "./contracts.ts";
// Audited against the downloaded official swagger and live response samples in
// docs/contracts. Upstream additions are allowed; malformed records fail visibly.
const text = z.string().nullish();
const concept = z.object({ concept_id: text, label: text }).nullish();
const address = z.object({
  municipality: text,
  municipality_concept_id: text,
  city: text,
});
const safeUrl = z
  .string()
  .url()
  .refine((s) => ["https:", "http:"].includes(new URL(s).protocol));
export const JobSearchAdSchema = z.object({
  id: z.string(),
  headline: z.string(),
  webpage_url: safeUrl,
  description: z.object({ text: z.string().nullable() }),
  employer: z.object({ name: text, workplace: text }).nullish(),
  occupation: concept,
  occupation_group: concept,
  occupation_field: concept,
  workplace_address: address.nullish(),
  workplace_model: concept,
  employment_type: concept,
  working_hours_type: concept,
  application_deadline: text,
  publication_date: z.string(),
  removed: z.boolean().optional(),
  application_details: z.object({ url: text }).nullish(),
});
export const JobLinksAdSchema = z.object({
  id: z.string(),
  headline: z.string(),
  brief: z.string().nullish(),
  employer: z.object({ name: text }).nullish(),
  occupation_group: concept,
  occupation_field: concept,
  workplace_addresses: z.array(address).nullish(),
  publication_date: z.string(),
  source_links: z.array(z.object({ label: z.string(), url: safeUrl })).min(1),
});
// Date-time fields currently lack an offset. We retain the calendar date in UI.
// Treat unzoned fields as Swedish civil time, with DST, rather than server TZ.
export function jobtechDate(value: string): string {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value))
    return new Date(value).toISOString();
  const naive = Date.parse(value + "Z");
  if (!Number.isFinite(naive)) throw new Error("INVALID_SOURCE_DATE");
  let utc = naive;
  for (let i = 0; i < 2; i++) {
    const offset = new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Stockholm",
      timeZoneName: "shortOffset",
    })
      .formatToParts(utc)
      .find((x) => x.type === "timeZoneName")!.value;
    const hours = Number(offset.replace("GMT", "")) || 0;
    utc = naive - hours * 3600000;
  }
  return new Date(utc).toISOString();
}
export function normalizeJobSearch(raw: unknown): Job {
  const a = JobSearchAdSchema.parse(raw);
  const model = a.workplace_model?.label?.toLocaleLowerCase("sv-SE");
  return JobSchema.parse({
    id: `jobsearch:${a.id}`,
    source: "jobsearch",
    externalId: a.id,
    canonicalUrl: a.webpage_url,
    sourceUrl: a.webpage_url,
    title: a.headline,
    employer: a.employer?.name ?? a.employer?.workplace ?? null,
    location:
      a.workplace_address?.municipality ?? a.workplace_address?.city ?? null,
    municipalityId: a.workplace_address?.municipality_concept_id ?? null,
    occupationIds: [
      a.occupation,
      a.occupation_group,
      a.occupation_field,
    ].flatMap((c) => (c?.concept_id ? [c.concept_id] : [])),
    publishedAt: jobtechDate(a.publication_date),
    deadline: a.application_deadline
      ? jobtechDate(a.application_deadline)
      : null,
    removed: a.removed ?? false,
    description: a.description.text ?? "",
    descriptionCompleteness: "full",
    workStyle:
      model === "arbete på plats"
        ? "onsite"
        : model === "hybridarbete"
          ? "hybrid"
          : model === "distansarbete"
            ? "remote"
            : "unknown",
    employment: a.working_hours_type?.label ?? a.employment_type?.label ?? null,
    salaryMaximumSek: null,
  });
}
export function normalizeJobLinks(raw: unknown): Job {
  const a = JobLinksAdSchema.parse(raw),
    addr = a.workplace_addresses?.[0];
  return JobSchema.parse({
    id: `jobadlinks:${a.id}`,
    source: "jobadlinks",
    externalId: a.id,
    canonicalUrl: a.source_links[0].url,
    sourceUrl: a.source_links[0].url,
    title: a.headline,
    employer: a.employer?.name ?? null,
    location: addr?.municipality ?? addr?.city ?? null,
    municipalityId: addr?.municipality_concept_id ?? null,
    occupationIds: [a.occupation_group, a.occupation_field].flatMap((c) =>
      c?.concept_id ? [c.concept_id] : [],
    ),
    publishedAt: jobtechDate(a.publication_date),
    deadline: null,
    removed: false,
    description: a.brief ?? "",
    descriptionCompleteness: "excerpt",
    workStyle: "unknown",
    employment: null,
    salaryMaximumSek: null,
  });
}
export function createJobTechSource(
  name: "jobsearch" | "jobadlinks",
  transport: typeof fetch = fetch,
): JobSource {
  const base =
    name === "jobsearch"
      ? "https://jobsearch.api.jobtechdev.se"
      : "https://links.api.jobtechdev.se";
  const normalize =
    name === "jobsearch" ? normalizeJobSearch : normalizeJobLinks;
  async function request(url: URL) {
    const response = await transport(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
    return response.json();
  }
  return {
    name,
    async search(input) {
      const url = new URL(name === "jobsearch" ? "/search" : "/joblinks", base);
      url.searchParams.set("q", input.query.slice(0, 200));
      url.searchParams.set("limit", "50");
      url.searchParams.set("sort", "pubdate-desc");
      const offset = input.cursor ? Number(input.cursor) : 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > 2000)
        throw new Error("INVALID_CURSOR");
      url.searchParams.set("offset", String(offset));
      // Common occupation-group IDs work across both APIs; not occupation-name IDs.
      input.occupationIds.forEach((id) =>
        url.searchParams.append("occupation-group", id),
      );
      input.municipalityIds.forEach((id) =>
        url.searchParams.append("municipality", id),
      );
      if (input.since)
        url.searchParams.set(
          "published-after",
          input.since.replace(/Z$/, "").slice(0, 19),
        );
      const data = z
        .object({
          hits: z.array(z.unknown()),
          total: z.object({ value: z.number() }),
        })
        .parse(await request(url));
      return {
        jobs: data.hits.map(normalize),
        fetchedAt: new Date().toISOString(),
        ...(offset + data.hits.length < Math.min(data.total.value, 2000)
          ? { nextCursor: String(offset + data.hits.length) }
          : {}),
      };
    },
    async get(id) {
      if (!/^[\w-]{1,100}$/.test(id)) throw new Error("INVALID_JOB_ID");
      const data = await request(
        new URL(`/ad/${encodeURIComponent(id)}`, base),
      );
      return data ? normalize(data) : null;
    },
  };
}
