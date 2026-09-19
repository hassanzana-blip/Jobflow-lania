import { requireUser } from "@/server/supabase";
import { database } from "@/server/db";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
import { ProfileInputSchema } from "@/core/workspace";
import { rateLimit } from "@/server/limits";
import { randomUUID } from "node:crypto";
export async function PUT(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "profile", 10);
    const p = ProfileInputSchema.parse(await readJson(req)),
      sql = database();
    const version = await sql.begin(async (tx) => {
      const [row] =
        await tx`update profiles set display_name=${p.displayName},location=${p.location},confirmed_at=now(),version=version+1,onboarding_step=7,updated_at=now() where user_id=${user.id} and version=${p.expectedVersion} and state='active' returning version`;
      if (!row) throw new Error("VERSION_CONFLICT");
      const x = p.preferences;
      await tx`update candidate_preferences set roles=${tx.array(x.roles)},occupation_ids=${tx.array(x.occupationIds)},locations=${tx.array(x.locations)},work_style=${x.workStyle},employment=${tx.array(x.employment)},minimum_salary=${x.minimumSalary},excluded_titles=${tx.array(x.excludedTitles)},excluded_companies=${tx.array(x.excludedCompanies)},willing_to_relocate=${x.willingToRelocate},languages=${tx.array(x.languages)} where user_id=${user.id}`;
      // Facts get new server IDs per immutable profile version. Old evidence
      // remains usable by earlier documents, without trusting client fact IDs.
      for (const f of p.facts)
        await tx`insert into candidate_facts(id,user_id,profile_version,kind,fact,source_quote,confirmed) values(${randomUUID()},${user.id},${row.version},${f.kind},${f.text},${f.text},true)`;
      return row.version;
    });
    return Response.json({ ok: true, version });
  } catch (e) {
    return errorResponse(e);
  }
}
