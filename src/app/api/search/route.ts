import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
import { rateLimit } from "@/server/limits";
import { loadWorkspace, searchForUser } from "@/server/workspace";
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "search", 6, 300);
    const { query } = z
      .object({ query: z.string().trim().max(200) })
      .strict()
      .parse(await readJson(req));
    const data = await loadWorkspace();
    const result = await searchForUser(user.id, {
      query: query || data.profile.preferences.roles.join(" "),
      preferences: data.profile.preferences,
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
