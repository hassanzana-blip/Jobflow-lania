import { requireUser } from "@/server/supabase";
import { database } from "@/server/db";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
import { JobActionSchema } from "@/core/workspace";
import { rateLimit } from "@/server/limits";
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "job-action");
    const { jobId, action } = JobActionSchema.parse(await readJson(req));
    const sql = database();
    const [job] = await sql`select id from jobbflow.jobs where id=${jobId}`;
    if (!job) throw new Error("NOT_FOUND");
    if (action === "save")
      await sql`insert into jobbflow.saved_jobs(user_id,job_id) values(${user.id},${jobId}) on conflict do nothing`;
    if (action === "unsave")
      await sql`delete from jobbflow.saved_jobs where user_id=${user.id} and job_id=${jobId}`;
    if (action === "dismiss")
      await sql`insert into jobbflow.dismissed_jobs(user_id,job_id) values(${user.id},${jobId}) on conflict do nothing`;
    if (action === "restore")
      await sql`delete from jobbflow.dismissed_jobs where user_id=${user.id} and job_id=${jobId}`;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
