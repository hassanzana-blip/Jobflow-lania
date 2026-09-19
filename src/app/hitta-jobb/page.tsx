import { MobileWorkspace } from "@/components/mobile-workspace";
import { emptyPreferences, type WorkspaceData } from "@/core/workspace";
import { discover } from "@/server/discover";
export const dynamic = "force-dynamic";
export default async function Discover() {
  const result = await discover("").catch(() => ({
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
  return <MobileWorkspace mode="guest" initial={data} />;
}
