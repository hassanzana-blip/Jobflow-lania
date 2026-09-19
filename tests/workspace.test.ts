import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeJobSearch,
  normalizeJobLinks,
  createJobTechSource,
  jobtechDate,
} from "../src/core/jobtech.ts";
import { deduplicate } from "../src/core/matching.ts";
import { demoWorkspace } from "../src/core/demo-workspace.ts";
import {
  filterWorkspaceJobs,
  ProfileInputSchema,
} from "../src/core/workspace.ts";
import { applicationPdf } from "../src/core/pdf.ts";
import { PDFDocument } from "pdf-lib";
const sample = async (name: string) =>
  JSON.parse(
    await readFile(
      new URL(`../docs/contracts/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
test("real official samples normalize and duplicate the cross-feed vacancy by URL", async () => {
  const a = normalizeJobSearch((await sample("jobsearch-sample")).hits[0]);
  const b = normalizeJobLinks((await sample("links-sample")).hits[0]);
  assert.equal(a.descriptionCompleteness, "full");
  assert.equal(b.descriptionCompleteness, "excerpt");
  assert.equal(b.sourceUrl, a.sourceUrl);
  assert.equal(deduplicate([a, b]).jobs.length, 1);
  assert.equal(a.salaryMaximumSek, null);
  assert.equal(b.workStyle, "unknown");
});
test("source URL schemes cannot inject executable links", async () => {
  const s = (await sample("links-sample")).hits[0];
  s.source_links[0].url = "javascript:alert(1)";
  assert.throws(() => normalizeJobLinks(s));
});
test("upstream malformed or failed response is not turned into successful empty results", async () => {
  const source = createJobTechSource(
    "jobsearch",
    async () => new Response("{}", { status: 200 }),
  );
  await assert.rejects(
    source.search({ query: "HR", occupationIds: [], municipalityIds: [] }),
  );
  const failed = createJobTechSource(
    "jobsearch",
    async () => new Response("", { status: 503 }),
  );
  await assert.rejects(
    failed.search({ query: "HR", occupationIds: [], municipalityIds: [] }),
  );
});
test("query parameters use official occupation-group and municipality collection names", async () => {
  let requested = "";
  const source = createJobTechSource("jobadlinks", async (input) => {
    requested = String(input);
    return Response.json({ hits: [], total: { value: 0 } });
  });
  await source.search({
    query: "HR & personal",
    occupationIds: ["bjqk_F3A_5Hk"],
    municipalityIds: ["PVZL_BQT_XtL"],
  });
  const u = new URL(requested);
  assert.equal(u.pathname, "/joblinks");
  assert.equal(u.searchParams.get("q"), "HR & personal");
  assert.equal(u.searchParams.get("occupation-group"), "bjqk_F3A_5Hk");
  assert.equal(u.searchParams.get("municipality"), "PVZL_BQT_XtL");
});
test("source dates remain independent of host timezone and handle Swedish DST", () => {
  assert.equal(jobtechDate("2026-01-12T12:00:00"), "2026-01-12T11:00:00.000Z");
  assert.equal(jobtechDate("2026-07-12T12:00:00"), "2026-07-12T10:00:00.000Z");
});
test("saved, dismissed, work style and text filters compose without changing source jobs", () => {
  const data = demoWorkspace();
  const options = {
    savedOnly: true,
    saved: ["example-0", "example-1"],
    dismissed: ["example-0"],
    workStyle: "remote",
    query: "people",
  };
  const result = filterWorkspaceJobs(data.jobs, options);
  assert.deepEqual(
    result.map((j) => j.id),
    ["example-1"],
  );
  assert.equal(data.jobs.length, 3);
});
test("candidate confirmation cannot be forged as false or omit experience", () => {
  const p = demoWorkspace().profile;
  const input = {
    displayName: p.displayName,
    location: p.location,
    expectedVersion: p.version,
    confirmed: false,
    facts: p.facts,
    preferences: p.preferences,
  };
  assert.equal(ProfileInputSchema.safeParse(input).success, false);
  assert.equal(
    ProfileInputSchema.safeParse({ ...input, confirmed: true, facts: [] })
      .success,
    false,
  );
});
test("PDF supports Swedish, wraps long words and creates multiple pages without clipping", async () => {
  const font = await readFile(
    new URL("../public/fonts/Inter-Regular.ttf", import.meta.url),
  );
  const bytes = await applicationPdf({
    name: "Åsa Östlund",
    title: "HR-specialist",
    text:
      "Erfarenhet av arbetsrätt och lönefrågor.\n".repeat(180) +
      "L".repeat(250),
    font,
  });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 2);
});
