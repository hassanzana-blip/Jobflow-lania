import { taxonomy } from "@/core/sources";
import { z } from "zod";
import { errorResponse } from "@/server/request";
export async function GET(req: Request) {
  try {
    const q = z
      .string()
      .max(100)
      .parse(new URL(req.url).searchParams.get("q") ?? "");
    return Response.json(
      { concepts: await taxonomy.search(q, "occupation") },
      { headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
