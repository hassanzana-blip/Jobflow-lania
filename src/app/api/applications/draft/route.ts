import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { requireUser } from "@/server/supabase";
import { database } from "@/server/db";
import { loadWorkspace, jobFromRow } from "@/server/workspace";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
import { rateLimit } from "@/server/limits";
import { MuseProvider } from "@/core/muse";
import { CandidateSchema } from "@/core/contracts";
export const maxDuration = 60;
export async function POST(req: Request) {
  let reservation: string | null = null;
  let leaseOwner: string | null = null;
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "draft", 4, 300);
    const { applicationId } = z
      .object({ applicationId: z.uuid() })
      .strict()
      .parse(await readJson(req));
    const sql = database();
    const [existing] =
      await sql`select v.id,v.content from jobbflow.application_documents d join jobbflow.cv_versions v on v.id=d.cv_version_id and v.user_id=d.user_id where d.application_id=${applicationId} and d.user_id=${user.id} and d.kind='tailored_cv'`;
    if (existing)
      return Response.json({
        documentId: existing.id,
        text: existing.content.text,
      });
    const [job] =
      await sql`select j.* from jobbflow.applications a join jobbflow.jobs j on j.id=a.job_id where a.id=${applicationId} and a.user_id=${user.id} and j.removed_at is null and (j.deadline is null or j.deadline>now())`;
    if (!job) throw new Error("NOT_FOUND");
    const data = await loadWorkspace();
    if (!data.profile.confirmed || !data.profile.facts.length)
      throw new Error("PROFILE_UNCONFIRMED");
    const owner = randomUUID();
    const [lease] =
      await sql`insert into jobbflow.draft_generation_leases(user_id,application_id,owner,expires_at) values(${user.id},${applicationId},${owner},now()+interval '2 minutes') on conflict(user_id,application_id) do update set owner=excluded.owner,expires_at=excluded.expires_at where draft_generation_leases.expires_at<now() returning owner`;
    if (!lease) throw new Error("GENERATION_IN_PROGRESS");
    leaseOwner = owner;
    let text = data.profile.facts
      .filter((f) => f.confirmed)
      .map((f) => f.text)
      .join("\n\n");
    let provenance: unknown = null;
    const key = process.env.META_MODEL_API_KEY;
    if (key) {
      const [r] =
        await sql`select jobbflow.reserve_usage(${user.id},'tailored_application',${owner}) as id`;
      reservation = r.id;
      // A lease prevents concurrent calls. Failed attempts release quota;
      // completed documents are returned before acquiring another reservation.
      const metrics: Parameters<
        NonNullable<ConstructorParameters<typeof MuseProvider>[0]["observe"]>
      >[0][] = [];
      const provider = new MuseProvider({
        key,
        observe: (m) => metrics.push(m),
      });
      const candidate = CandidateSchema.parse({
        id: user.id,
        version: data.profile.version,
        confirmedAt: new Date().toISOString(),
        facts: data.profile.facts,
        preferences: data.profile.preferences,
      });
      try {
        const draft = await provider.tailorCV(candidate, jobFromRow(job));
        provenance = draft;
        text = draft.sections
          .map(
            (s) => `${s.heading}\n${s.sentences.map((x) => x.text).join(" ")}`,
          )
          .join("\n\n");
      } finally {
        for (const m of metrics)
          await sql`insert into jobbflow.model_usage(operation,model,input_tokens,cached_tokens,output_tokens,latency_ms,success,estimated_usd) values(${m.operation},${m.model},${m.inputTokens},${m.cachedTokens},${m.outputTokens},${m.latencyMs},${m.success},${m.estimatedUsd})`;
      }
    }
    const content = {
        text,
        originalText: text,
        provenance,
        method: key ? "muse" : "confirmed-profile",
      },
      id = randomUUID();
    const saved = await sql.begin(async (tx) => {
      const [p] =
        await tx`select version from jobbflow.profiles where user_id=${user.id} and state='active' for update`;
      if (!p || p.version !== data.profile.version)
        throw new Error("VERSION_CONFLICT");
      const [a] =
        await tx`select id from jobbflow.applications where id=${applicationId} and user_id=${user.id} for update`;
      if (!a) throw new Error("NOT_FOUND");
      const [found] =
        await tx`select v.id,v.content from jobbflow.application_documents d join jobbflow.cv_versions v on v.id=d.cv_version_id and v.user_id=d.user_id where d.application_id=${applicationId} and d.user_id=${user.id} and d.kind='tailored_cv'`;
      if (found)
        return {
          documentId: found.id as string,
          text: found.content.text as string,
        };
      await tx`insert into jobbflow.cv_versions(id,user_id,profile_version,content,content_hash) values(${id},${user.id},${p.version},${tx.json(content as any)},${createHash("sha256").update(JSON.stringify(content)).digest("hex")})`;
      await tx`insert into jobbflow.application_documents(user_id,application_id,cv_version_id,kind) values(${user.id},${applicationId},${id},'tailored_cv')`;
      if (reservation)
        await tx`update jobbflow.usage_events set state='settled' where id=${reservation} and user_id=${user.id}`;
      return { documentId: id, text };
    });
    return Response.json(saved);
  } catch (e) {
    if (reservation)
      await database()`update jobbflow.usage_events set state='released' where id=${reservation} and state='reserved'`.catch(
        () => {},
      );
    return errorResponse(e);
  } finally {
    if (leaseOwner)
      await database()`delete from jobbflow.draft_generation_leases where owner=${leaseOwner}`.catch(
        () => {},
      );
  }
}
export async function PATCH(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "draft-edit");
    const input = z
      .object({
        applicationId: z.uuid(),
        expectedDocumentId: z.uuid(),
        text: z.string().trim().min(1).max(30000),
        reviewed: z.literal(true),
      })
      .strict()
      .parse(await readJson(req));
    const sql = database();
    const documentId = await sql.begin(async (tx) => {
      const [previous] =
        await tx`select d.id as link_id,v.id,v.profile_version,v.content from jobbflow.application_documents d join jobbflow.cv_versions v on v.id=d.cv_version_id and v.user_id=d.user_id where d.application_id=${input.applicationId} and d.user_id=${user.id} and d.kind='tailored_cv' for update of d`;
      if (!previous) throw new Error("NOT_FOUND");
      if (previous.id !== input.expectedDocumentId)
        throw new Error("VERSION_CONFLICT");
      const id = randomUUID(),
        content = {
          ...previous.content,
          text: input.text,
          editedByCandidate: true,
        };
      await tx`insert into jobbflow.cv_versions(id,user_id,profile_version,content,content_hash,reviewed_at) values(${id},${user.id},${previous.profile_version},${tx.json(content)},${createHash("sha256").update(JSON.stringify(content)).digest("hex")},now())`;
      await tx`update jobbflow.application_documents set cv_version_id=${id} where id=${previous.link_id} and user_id=${user.id}`;
      return id;
    });
    return Response.json({ ok: true, documentId });
  } catch (e) {
    return errorResponse(e);
  }
}
