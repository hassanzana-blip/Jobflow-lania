import test from "node:test";
import assert from "node:assert/strict";
import { CandidateSchema, JobSchema } from "../src/core/contracts.ts";
import {
  planSearch,
  analysisOperationId,
  ANALYSIS_BUDGET_PER_SEARCH,
  MAX_RETAINED,
} from "../src/core/pipeline.ts";

const job = (over: Record<string, unknown> = {}) =>
  JobSchema.parse({
    id: "1",
    source: "jobsearch",
    externalId: "a",
    canonicalUrl: "https://example.org/jobs/1",
    sourceUrl: "https://example.org/jobs/1",
    title: "HR Business Partner",
    employer: "Example",
    municipalityId: null,
    location: "Stockholm",
    occupationIds: [],
    publishedAt: "2026-09-18T00:00:00.000Z",
    deadline: null,
    removed: false,
    description: "test",
    descriptionCompleteness: "full",
    workStyle: "unknown",
    employment: null,
    salaryMaximumSek: null,
    ...over,
  });

const numbered = (n: number, over: Record<string, unknown> = {}) =>
  job({
    id: `job-${n}`,
    externalId: `ext-${n}`,
    canonicalUrl: `https://example.org/jobs/${n}`,
    sourceUrl: `https://example.org/jobs/${n}`,
    ...over,
  });

const candidate = (preferences: Record<string, unknown> = {}) =>
  CandidateSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    version: 3,
    confirmedAt: "2026-09-19T00:00:00.000Z",
    facts: [
      {
        id: "f1",
        kind: "experience",
        text: "6 år inom HR",
        sourceQuote: "6 år inom HR",
        confirmed: true,
      },
    ],
    preferences: {
      roles: ["HR Business Partner"],
      occupationIds: [],
      locations: [],
      workStyle: "any",
      employment: [],
      minimumSalary: null,
      excludedTitles: [],
      excludedCompanies: [],
      willingToRelocate: true,
      languages: [],
      ...preferences,
    },
  });

const ok = [
  { source: "jobsearch", status: "ok" },
  { source: "jobadlinks", status: "ok" },
];

test("the model is never shown a job the candidate ruled out", () => {
  const plan = planSearch({
    retrieved: [
      numbered(1),
      numbered(2, { title: "Butikschef", employer: "Ingen AB" }),
      numbered(3, { employer: "Uteslutet AB" }),
      numbered(4, { removed: true }),
      numbered(5, { deadline: "2020-01-01T00:00:00.000Z" }),
    ],
    candidate: candidate({
      excludedTitles: ["Butikschef"],
      excludedCompanies: ["Uteslutet AB"],
    }),
    sources: ok,
    now: new Date("2026-09-19T00:00:00.000Z"),
  });

  const visible = [...plan.analyse, ...plan.retrievedOnly].map((j) => j.id);
  assert.deepEqual(visible, ["job-1"]);
  assert.deepEqual(
    plan.rejected.map((r) => [r.job.id, r.reasons]).sort(),
    [
      ["job-2", ["excluded_title"]],
      ["job-3", ["excluded_company"]],
      ["job-4", ["removed"]],
      ["job-5", ["expired"]],
    ].sort(),
  );
  // Whatever else happens, a rejected ad must not reach the provider.
  const rejectedIds = new Set(plan.rejected.map((r) => r.job.id));
  assert.equal(plan.analyse.some((j) => rejectedIds.has(j.id)), false);
});

test("only the top few are analysed, however many are retrieved", () => {
  const many = Array.from({ length: 40 }, (_, n) => numbered(n));
  const plan = planSearch({ retrieved: many, candidate: candidate(), sources: ok });
  assert.equal(plan.analyse.length, ANALYSIS_BUDGET_PER_SEARCH);
  assert.equal(plan.retrievedOnly.length, 40 - ANALYSIS_BUDGET_PER_SEARCH);
  assert.equal(plan.counts.retrieved, 40);
  assert.equal(plan.counts.eligible, 40);
  assert.equal(plan.counts.analyse, ANALYSIS_BUDGET_PER_SEARCH);
  // A caller cannot ask for more than the cap, and asking for none is honoured.
  assert.equal(
    planSearch({ retrieved: many, candidate: candidate(), sources: ok, budget: 500 })
      .analyse.length,
    ANALYSIS_BUDGET_PER_SEARCH,
  );
  assert.equal(
    planSearch({ retrieved: many, candidate: candidate(), sources: ok, budget: 0 })
      .analyse.length,
    0,
  );
  // Nothing is shown twice.
  const shown = [...plan.analyse, ...plan.retrievedOnly].map((j) => j.id);
  assert.equal(new Set(shown).size, shown.length);
});

test("the same vacancy from two feeds is one job, analysed once", () => {
  // Platsbanken and JobAd Links both carry the same advert; the canonical URL
  // is what makes them one, and tracking parameters must not break that.
  const plan = planSearch({
    retrieved: [
      numbered(1),
      job({
        id: "job-1-copy",
        source: "jobadlinks",
        externalId: "other",
        canonicalUrl: "https://example.org/jobs/1?utm_source=newsletter",
        sourceUrl: "https://example.org/jobs/1?utm_source=newsletter",
      }),
    ],
    candidate: candidate(),
    sources: ok,
  });
  assert.equal(plan.counts.retrieved, 2);
  assert.equal(plan.counts.afterDeduplication, 1);
  assert.equal(plan.analyse.length, 1);
});

test("a source that did not answer marks the result incomplete", () => {
  const partial = planSearch({
    retrieved: [numbered(1)],
    candidate: candidate(),
    sources: [
      { source: "jobsearch", status: "ok" },
      { source: "jobadlinks", status: "unavailable" },
    ],
  });
  assert.equal(partial.partial, true);
  // What did arrive is still shown rather than discarded.
  assert.equal(partial.analyse.length, 1);
  assert.equal(planSearch({ retrieved: [], candidate: candidate(), sources: ok }).partial, false);
});

test("the retained list is capped even when everything is eligible", () => {
  const plan = planSearch({
    retrieved: Array.from({ length: MAX_RETAINED + 25 }, (_, n) => numbered(n)),
    candidate: candidate(),
    sources: ok,
  });
  assert.equal(plan.analyse.length + plan.retrievedOnly.length, MAX_RETAINED);
});

test("analysing the same job twice reuses one reservation", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const first = analysisOperationId(user, "job-1", 3);
  assert.equal(analysisOperationId(user, "job-1", 3), first);
  assert.match(
    first,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  // A different job, candidate, or confirmed profile version is a different
  // analysis and must be charged separately.
  assert.notEqual(analysisOperationId(user, "job-2", 3), first);
  assert.notEqual(analysisOperationId(user, "job-1", 4), first);
  assert.notEqual(
    analysisOperationId("22222222-2222-4222-8222-222222222222", "job-1", 3),
    first,
  );
});

const scoredJob = job({ location: "Stockholm" });

/** A provider whose transport returns exactly the match the test dictates. */
async function providerReturning(match: unknown) {
  const { MuseProvider } = await import("../src/core/muse.ts");
  return new MuseProvider({
    key: "test",
    transport: async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(match) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
  });
}

const factor = (over: Record<string, unknown> = {}) => ({
  key: "role",
  value: 0.9,
  evidenceIds: ["f1"],
  reason: "HR-erfarenhet matchar rollen",
  source: "ai",
  blocker: false,
  ...over,
});

test("the score is computed from the evidence, not taken from the model", async () => {
  const provider = await providerReturning({
    factors: [
      factor(),
      factor({ key: "skills", value: 0.8 }),
      factor({ key: "experience", value: 1 }),
      // The provider marks every scored factor as AI-sourced, so each one
      // needs evidence the candidate confirmed — location included.
      factor({ key: "location", value: 1 }),
      factor({ key: "seniority", value: null, evidenceIds: [], source: "unknown" }),
    ],
    summary: "Stark matchning på HR-erfarenhet.",
    gaps: ["Lön framgår inte av annonsen"],
  });
  const match = await provider.scoreJob(candidate(), scoredJob);

  // Weighted: role 20, skills 20, experience 15, location 10 = 65 covered.
  assert.equal(match.coverage, 65);
  assert.equal(
    match.score,
    Math.round(((20 * 0.9 + 20 * 0.8 + 15 * 1 + 10 * 1) / 65) * 100),
  );
  assert.equal(match.confidence, "medium");
  assert.equal(match.methodVersion, "evidence-v1");
  // A gap is part of the answer and survives to the candidate.
  assert.deepEqual(match.gaps, ["Lön framgår inte av annonsen"]);
  // The unknown factor stays unscored rather than being guessed at.
  assert.equal(match.factors.find((f) => f.key === "seniority")?.value, null);
});

test("a match citing a qualification the candidate never confirmed is refused", async () => {
  const provider = await providerReturning({
    factors: [factor({ evidenceIds: ["fabricated-fact"] })],
    summary: "Kandidaten har lett ett team på 20 personer.",
    gaps: [],
  });
  await assert.rejects(
    () => provider.scoreJob(candidate(), scoredJob),
    /Unconfirmed evidence/,
  );
});

test("a model cannot score a factor it also calls unknown", async () => {
  const provider = await providerReturning({
    factors: [factor({ key: "salary", value: 0.9, evidenceIds: [], source: "ai" })],
    summary: "",
    gaps: [],
  });
  // No evidence behind an AI factor, so it cannot become part of a score.
  await assert.rejects(
    () => provider.scoreJob(candidate(), scoredJob),
    /AI factor requires evidence/,
  );
});
