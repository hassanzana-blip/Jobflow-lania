import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/server/supabase";
import { database } from "@/server/db";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
import { ApplicationUpdateSchema } from "@/core/workspace";
import { rateLimit } from "@/server/limits";
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "applications");
    const { jobId } = z
      .object({ jobId: z.uuid() })
      .strict()
      .parse(await readJson(req));
    const sql = database();
    const [a] =
      await sql`insert into jobbflow.applications(id,user_id,job_id,status) select ${randomUUID()},${user.id},id,'preparing' from jobbflow.jobs where id=${jobId} and removed_at is null and (deadline is null or deadline>now()) on conflict(user_id,job_id) do update set user_id=excluded.user_id returning *`;
    if (!a) throw new Error("JOB_EXPIRED");
    return Response.json({
      id: a.id,
      jobId: a.job_id,
      status: a.status,
      notes: a.notes ?? "",
      interviewAt: a.interview_at?.toISOString() ?? null,
      followUpAt: a.follow_up_at?.toISOString() ?? null,
      updatedAt: a.updated_at.toISOString(),
      documentId: null,
      draftText: null,
      reviewed: false,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "applications");
    const p = ApplicationUpdateSchema.parse(await readJson(req)),
      sql = database();
    const a = await sql.begin(async (tx) => {
      const [row] =
        await tx`update jobbflow.applications set status=${p.status},notes=${p.notes},interview_at=${p.interviewAt},follow_up_at=${p.followUpAt},applied_at=case when ${p.status}='applied' then coalesce(applied_at,now()) else applied_at end,updated_at=now() where user_id=${user.id} and id=${p.id} and updated_at=${p.expectedUpdatedAt}::timestamptz returning updated_at`;
      if (!row) throw new Error("VERSION_CONFLICT");
      await tx`insert into jobbflow.application_events(user_id,application_id,event_type) values(${user.id},${p.id},${`candidate_status:${p.status}`})`;
      return row;
    });
    return Response.json({ ok: true, updatedAt: a.updated_at.toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}
