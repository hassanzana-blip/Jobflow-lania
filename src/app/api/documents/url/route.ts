import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { errorResponse } from "@/server/request";
import { rateLimit } from "@/server/limits";
import { signedDocumentUrl } from "@/server/documents";

/**
 * Hands back a short-lived link to the candidate's own upload.
 *
 * The bucket is private and has no client policies, so this route is the only
 * way in. It checks ownership in the query itself and refuses anything not
 * positively scanned clean — with no scanner configured that is every document,
 * which is the honest answer rather than serving unscanned uploads back out.
 */
export async function GET(req: Request) {
  try {
    const { user } = await requireUser();
    await rateLimit(user.id, "document_url", 30);
    const { id } = z
      .object({ id: z.uuid() })
      .strict()
      .parse({ id: new URL(req.url).searchParams.get("id") });
    const link = await signedDocumentUrl(user.id, id);
    return Response.json(link, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
