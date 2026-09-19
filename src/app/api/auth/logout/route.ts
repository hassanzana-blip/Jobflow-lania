import { userClient } from "@/server/supabase";
import { mutationGuard, errorResponse } from "@/server/request";
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const client = await userClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
