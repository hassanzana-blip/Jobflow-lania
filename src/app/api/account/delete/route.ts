import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse } from "@/server/request";
import { database } from "@/server/db";
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    if (process.env.ENABLE_ACCOUNT_DELETION !== "true")
      return Response.json(
        { error: "DELETION_WORKER_NOT_ENABLED" },
        { status: 503 },
      );
    const { user, client } = await requireUser();
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(await req.json());
    await database().begin(async (tx) => {
      await tx`insert into jobbflow.deletion_requests(user_id) values(${user.id}) on conflict(user_id) do nothing`;
      await tx`update jobbflow.profiles set state='deleting' where user_id=${user.id}`;
      await tx`update jobbflow.notifications set status='canceled' where user_id=${user.id} and status='pending'`;
      await tx`update jobbflow.agent_runs set status='canceled' where user_id=${user.id} and status in ('queued','running')`;
    });
    await client.auth.signOut();
    return Response.json(
      { status: "requested", completed: false },
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
