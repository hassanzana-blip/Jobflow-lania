import { database } from "@/server/db";
import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
export async function PATCH(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await readJson(req));
    const sql = database();
    await sql`update jobbflow.notification_settings set new_matches=${enabled} where user_id=${user.id}`;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
