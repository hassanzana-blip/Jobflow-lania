import "server-only";
import { retrieve } from "@/core/sources";
import { deduplicate } from "@/core/matching";
import type { WorkspaceJob, WorkspaceData } from "@/core/workspace";
export async function discover(query: string) {
  const result = await retrieve({
    query,
    occupationIds: [],
    municipalityIds: [],
  });
  if (result.sources.every((s) => s.status === "unavailable"))
    throw new Error("SOURCES_UNAVAILABLE");
  return {
    jobs: deduplicate(result.jobs)
      .jobs.filter(
        (j) =>
          !j.removed && (!j.deadline || Date.parse(j.deadline) > Date.now()),
      )
      .slice(0, 60)
      .map(
        (j) =>
          ({
            ...j,
            score: null,
            coverage: 0,
            matchKind: "retrieved",
            reasons: [],
            gaps: [],
          }) as WorkspaceJob,
      ),
    sources: result.sources as WorkspaceData["sources"],
    lastSearchAt: new Date().toISOString(),
  };
}
