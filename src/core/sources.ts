import type { JobSource, TaxonomySource } from "./contracts.ts";
import { createJobTechSource } from "./jobtech.ts";
import { createTaxonomySource } from "./taxonomy.ts";

export class IntegrationUnavailable extends Error {
  integration: string;
  reason: string;
  constructor(integration: string, reason: string) {
    super(`${integration}: ${reason}`);
    this.name = "IntegrationUnavailable";
    this.integration = integration;
    this.reason = reason;
  }
}
// No guessed upstream fields. Replace these guarded adapters only after official
// OpenAPI schemas have been downloaded, pinned and contract tests pass.
export function unverifiedJobSource(
  name: "jobsearch" | "jobadlinks",
): JobSource {
  return {
    name,
    async search() {
      throw new IntegrationUnavailable(
        name,
        "Official schema verification pending",
      );
    },
    async get() {
      throw new IntegrationUnavailable(
        name,
        "Official schema verification pending",
      );
    },
  };
}
export const taxonomy: TaxonomySource = createTaxonomySource();
export const sources = [
  createJobTechSource("jobsearch"),
  createJobTechSource("jobadlinks"),
];
export async function retrieve(
  input: Parameters<JobSource["search"]>[0],
  adapters: JobSource[] = sources,
) {
  const outcomes = await Promise.allSettled(
    adapters.map((s) => s.search(input)),
  );
  return {
    jobs: outcomes.flatMap((o) =>
      o.status === "fulfilled" ? o.value.jobs : [],
    ),
    sources: outcomes.map((o, i) => ({
      source: adapters[i].name,
      status: o.status === "fulfilled" ? "ok" : "unavailable",
      fetchedAt: o.status === "fulfilled" ? o.value.fetchedAt : null,
    })),
    complete: outcomes.every((o) => o.status === "fulfilled"),
  };
}
