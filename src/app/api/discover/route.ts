import { z } from "zod";
import { discover } from "@/server/discover";
import { errorResponse } from "@/server/request";
export async function GET(req: Request) {
  try {
    const q = z
      .string()
      .trim()
      .max(200)
      .parse(new URL(req.url).searchParams.get("q") ?? "");
    return Response.json(await discover(q), {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
