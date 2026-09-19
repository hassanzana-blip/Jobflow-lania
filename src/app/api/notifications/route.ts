import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
export async function PATCH(req: Request) {
  try {
    mutationGuard(req);
    const { client, user } = await requireUser();
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await readJson(req));
    const { error } = await client
      .from("notification_settings")
      .update({ new_matches: enabled })
      .eq("user_id", user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
