import test from "node:test";
import assert from "node:assert/strict";
import { CandidateSchema, JobSchema } from "../src/core/contracts.ts";
import {
  scoreFactors,
  filterJob,
  deduplicate,
  possibleDuplicateKey,
  canonicalUrl,
} from "../src/core/matching.ts";
import { validateDraft } from "../src/core/truthfulness.ts";
import {
  payloadHash,
  verifyApproval,
  canTransition,
} from "../src/core/approval.ts";
import {
  analyticsPayload,
  validateUpload,
  assertSameOrigin,
} from "../src/core/security.ts";
import { MuseProvider, estimateCost } from "../src/core/muse.ts";
import { retrieve, unverifiedJobSource } from "../src/core/sources.ts";

const candidate = CandidateSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
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
    roles: ["HR"],
    occupationIds: [],
    locations: ["Stockholm"],
    workStyle: "any",
    employment: [],
    minimumSalary: null,
    excludedTitles: [],
    excludedCompanies: [],
    willingToRelocate: false,
    languages: ["sv"],
  },
});
const job = JobSchema.parse({
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
});
const factor = (key: string, value: number | null, blocker = false) => ({
  key,
  value,
  blocker,
  evidenceIds: ["f1"],
  source: value === null ? "unknown" : "ai",
  reason: "Supported by confirmed facts",
});

test("unknown data lowers coverage and never produces a headline score", () => {
  const r = scoreFactors([factor("role", 1)], candidate);
  assert.equal(r.score, null);
  assert.equal(r.coverage, 20);
  assert.equal(r.strong, false);
});
test("verified blocker prevents strong label even with high score", () => {
  const r = scoreFactors(
    [
      factor("role", 1),
      factor("skills", 1),
      factor("experience", 1),
      factor("seniority", 1, true),
    ],
    candidate,
  );
  assert.equal(r.score, 100);
  assert.equal(r.strong, false);
});
test("duplicate factors and invented evidence are rejected", () => {
  assert.throws(() =>
    scoreFactors([factor("role", 1), factor("role", 1)], candidate),
  );
  assert.throws(() =>
    scoreFactors([{ ...factor("role", 1), evidenceIds: ["fake"] }], candidate),
  );
});
test("unknown salary and remote data are not treated as negative", () =>
  assert.equal(
    filterJob(job, {
      ...candidate.preferences,
      workStyle: "remote",
      minimumSalary: 50000,
    }).eligible,
    true,
  ));
test("expired jobs are excluded", () =>
  assert.equal(
    filterJob(
      { ...job, deadline: "2020-01-01T00:00:00.000Z" },
      candidate.preferences,
    ).eligible,
    false,
  ));
test("same vacancy URL deduplicates across sources", () => {
  const r = deduplicate([
    job,
    {
      ...job,
      id: "2",
      source: "jobadlinks",
      externalId: "b",
      canonicalUrl: job.canonicalUrl + "?utm_source=x",
    },
  ]);
  assert.equal(r.jobs.length, 1);
  assert.equal(r.aliases["2"], "1");
});
test("similar titles remain separate vacancies", () => {
  const other = {
    ...job,
    id: "2",
    externalId: "b",
    canonicalUrl: "https://example.org/jobs/2",
  };
  assert.equal(possibleDuplicateKey(job), possibleDuplicateKey(other));
  assert.equal(deduplicate([job, other]).jobs.length, 2);
});
test("URL normalization removes tracking only", () =>
  assert.equal(
    canonicalUrl("https://example.org/job?id=4&utm_campaign=x#apply"),
    "https://example.org/job?id=4",
  ));
test("tailoring rejects fabricated years and unconfirmed facts", () => {
  const draft = {
    sections: [
      {
        heading: "Erfarenhet",
        sentences: [{ text: "12 år inom HR", evidenceIds: ["f1"] }],
      },
    ],
    questionsForCandidate: [],
  };
  assert.throws(() => validateDraft(draft, candidate));
  draft.sections[0].sentences[0].text = "6 år inom HR";
  assert.equal(validateDraft(draft, candidate).sections.length, 1);
});
test("approval invalidates when answers or document hashes change", () => {
  const payload = {
    userId: "u",
    jobId: "j",
    destination: "https://example.org/apply",
    profileVersion: 1,
    documents: [{ id: "d", sha256: "old" }],
    answers: { salary: "50000" },
  };
  const a = {
    userId: "u",
    payloadHash: payloadHash(payload),
    expiresAt: "2099-01-01T00:00:00.000Z",
    consumedAt: null,
  };
  assert(verifyApproval(a, payload));
  assert(!verifyApproval(a, { ...payload, answers: { salary: "60000" } }));
  assert(!verifyApproval({ ...a, consumedAt: "2026-01-01" }, payload));
  assert(!verifyApproval({ ...a, expiresAt: "invalid" }, payload));
});
test("cannot skip from saved to applied", () =>
  assert.equal(canTransition("saved", "applied"), false));
test("analytics drops candidate content and arbitrary plan text", () =>
  assert.deepEqual(
    analyticsPayload("cv_uploaded", {
      cv: "sensitive",
      email: "private",
      plan: "secret",
      count: 1,
    }),
    { event: "cv_uploaded", properties: { count: 1 } },
  ));
test("reject spoofed upload and cross-origin request", () => {
  assert.throws(() =>
    validateUpload(
      new TextEncoder().encode("hello"),
      "application/pdf",
      "cv.pdf",
    ),
  );
  assert.throws(() =>
    assertSameOrigin(
      new Request("https://jobflow.test", {
        headers: { origin: "https://evil.test" },
      }),
      "https://jobflow.test",
    ),
  );
});
test("Contributor model cannot be selected", () =>
  assert.throws(
    () =>
      new MuseProvider({ key: "test", model: "muse-spark-1.3-contributor" }),
  ));
test("cached input cost is not double counted", () =>
  assert.equal(estimateCost(1000000, 1000000, 0), 0.15));
test("malformed model output retries once then fails without logging content", async () => {
  let calls = 0;
  const metrics: unknown[] = [];
  const provider = new MuseProvider({
    key: "test",
    transport: async () => {
      calls++;
      return Response.json({
        choices: [{ message: { content: "broken" } }],
        usage: { prompt_tokens: 10, completion_tokens: 1 },
      });
    },
    observe: (m) => metrics.push(m),
  });
  await assert.rejects(
    () => provider.analyseCandidate("private CV"),
    /INVALID_OUTPUT/,
  );
  assert.equal(calls, 2);
  assert.equal(JSON.stringify(metrics).includes("private CV"), false);
});
test("source failure is explicit, never fixture fallback", async () => {
  const result = await retrieve(
    { query: "HR", occupationIds: [], municipalityIds: [] },
    [unverifiedJobSource("jobsearch")],
  );
  assert.equal(result.complete, false);
  assert.deepEqual(result.jobs, []);
  assert.equal(result.sources[0].status, "unavailable");
});
