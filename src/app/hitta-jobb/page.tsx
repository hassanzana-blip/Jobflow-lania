import { MobileWorkspace } from "@/components/mobile-workspace";
import { emptyPreferences, type WorkspaceData } from "@/core/workspace";
import { discover } from "@/server/discover";
import { readSearchUrl } from "@/core/search-params";
export const dynamic = "force-dynamic";
/**
 * The search state lives in the URL so a result list can be shared, reloaded
 * and reached from a link. The server runs the query the URL asks for, which
 * also means `/hitta-jobb?q=utvecklare` renders the right jobs on first paint
 * instead of the default list.
 */
export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { query, workStyle } = readSearchUrl(await searchParams);
  const result = await discover(query).catch(() => ({
    jobs: [],
    sources: [
      { source: "jobsearch", status: "unavailable" },
      { source: "jobadlinks", status: "unavailable" },
    ],
    lastSearchAt: null,
  }));
  const data: WorkspaceData = {
    ...result,
    profile: {
      displayName: "",
      location: "",
      version: 1,
      confirmed: false,
      facts: [],
      preferences: emptyPreferences,
    },
    saved: [],
    dismissed: [],
    applications: [],
    notifications: false,
    capabilities: {
      ai: false,
      cvUpload: false,
      billing: false,
      deletion: false,
    },
  };
  return (
    <MobileWorkspace
      mode="guest"
      initial={data}
      initialQuery={query}
      initialWorkStyle={workStyle}
      urlSync
    />
  );
}
