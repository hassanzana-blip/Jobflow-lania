import { z } from "zod";
import type { TaxonomySource } from "./contracts.ts";
// Latest published version observed 2026-09-19. Pinning prevents silent changes
// to a candidate's classifications. Upgrade only with a contract review.
export const TAXONOMY_VERSION = "31";
const concepts = z.array(
  z.object({
    "taxonomy/id": z.string(),
    "taxonomy/type": z.string(),
    "taxonomy/preferred-label": z.string(),
  }),
);
export function createTaxonomySource(
  transport: typeof fetch = fetch,
): TaxonomySource {
  const cache = new Map<
    string,
    { at: number; data: z.infer<typeof concepts> }
  >();
  async function get(params: Record<string, string>) {
    const url = new URL(
      "https://taxonomy.api.jobtechdev.se/v1/taxonomy/main/concepts",
    );
    Object.entries({
      ...params,
      version: TAXONOMY_VERSION,
      limit: "10000",
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    const key = url.toString(),
      hit = cache.get(key);
    if (hit && hit.at > Date.now() - 3600000) return hit.data;
    const r = await transport(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error("TAXONOMY_UNAVAILABLE");
    const data = concepts.parse(await r.json());
    cache.set(key, { at: Date.now(), data });
    return data;
  }
  return {
    async search(term, type) {
      const types = {
        occupation: "ssyk-level-4",
        skill: "skill",
        municipality: "municipality",
      };
      const rows = await get({ type: types[type] });
      const q = term.trim().toLocaleLowerCase("sv-SE");
      return rows
        .filter((c) =>
          c["taxonomy/preferred-label"].toLocaleLowerCase("sv-SE").includes(q),
        )
        .slice(0, 30)
        .map((c) => ({
          id: c["taxonomy/id"],
          label: c["taxonomy/preferred-label"],
          version: TAXONOMY_VERSION,
        }));
    },
    async related(id) {
      const rows = await get({ "related-ids": id, relation: "broader" });
      return rows.map((c) => ({ id: c["taxonomy/id"], relation: "broader" }));
    },
  };
}
