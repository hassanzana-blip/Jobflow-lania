import { requireUser } from "@/server/supabase";
import { errorResponse } from "@/server/request";
import { retrieve } from "@/core/sources";
export async function GET(req: Request) {
  try {
    await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.slice(0, 200) ?? "";
    const result = await retrieve({
      query: q,
      occupationIds: [],
      municipalityIds: [],
    });
    return Response.json(result, {
      status: result.complete ? 200 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
