import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse } from "@/server/request";
const schema = z
  .object({
    roles: z.array(z.string().min(1).max(120)).min(1).max(10),
    locations: z.array(z.string().max(150)).max(20),
    workStyle: z.enum(["any", "remote", "hybrid", "onsite"]),
  })
  .strict();
export async function PATCH(req: Request) {
  try {
    mutationGuard(req);
    const { client, user } = await requireUser();
    const p = schema.parse(await req.json());
    const { error } = await client
      .from("candidate_preferences")
      .update({
        roles: p.roles,
        locations: p.locations,
        work_style: p.workStyle,
      })
      .eq("user_id", user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
