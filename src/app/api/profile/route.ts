import { requireUser } from "@/server/supabase";
import { database } from "@/server/db";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
import { ProfileInputSchema } from "@/core/workspace";
import { StoredReviewSchema } from "@/core/extraction";
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
        await tx`update jobbflow.profiles set display_name=${p.displayName},location=${p.location},confirmed_at=now(),version=version+1,onboarding_step=7,updated_at=now() where user_id=${user.id} and version=${p.expectedVersion} and state='active' returning version`;
      if (!row) throw new Error("VERSION_CONFLICT");
      const x = p.preferences;
      await tx`update jobbflow.candidate_preferences set roles=${tx.array(x.roles)},occupation_ids=${tx.array(x.occupationIds)},locations=${tx.array(x.locations)},work_style=${x.workStyle},employment=${tx.array(x.employment)},minimum_salary=${x.minimumSalary},excluded_titles=${tx.array(x.excludedTitles)},excluded_companies=${tx.array(x.excludedCompanies)},willing_to_relocate=${x.willingToRelocate},languages=${tx.array(x.languages)} where user_id=${user.id}`;

      // When these facts came from reviewing a CV, the proposals are re-read
      // from the server's own copy of that review. Provenance is decided here,
      // from what the extraction recorded, not from what the client sends: a
      // caller cannot mark its own text as quoted from a document.
      let proposals = new Map<
        string,
        { kind: string; sourceQuote: string; grounded: boolean }
      >();
      let documentId: string | null = null;
      if (p.extractionId) {
        const [extraction] = await tx`
          select id,document_id,facts from jobbflow.document_extractions
          where id=${p.extractionId} and user_id=${user.id} and confirmed_at is null
          for update`;
        if (!extraction) throw new Error("NOT_FOUND");
        const stored = StoredReviewSchema.shape.facts.safeParse(extraction.facts);
        if (stored.success)
          proposals = new Map(
            stored.data.map((fact) => [
              fact.text.trim(),
              {
                kind: fact.kind,
                sourceQuote: fact.sourceQuote,
                grounded: fact.grounded,
              },
            ]),
          );
        documentId = extraction.document_id;
        await tx`update jobbflow.document_extractions set confirmed_at=now() where id=${p.extractionId} and user_id=${user.id}`;
      }

      // Facts get new server IDs per immutable profile version. Old evidence
      // remains usable by earlier documents, without trusting client fact IDs.
      for (const f of p.facts) {
        // A quote survives only on a proposal the candidate left untouched.
        // The grounding itself was established when the document was parsed,
        // by comparing the quote with the document text; that text is not kept
        // afterwards, so this trusts the server's own record of that check and
        // nothing the client sent. An edited fact matches no proposal and is
        // stored as the candidate's own statement, without borrowed evidence.
        const proposal = proposals.get(f.text.trim());
        const quote = proposal?.grounded ? proposal.sourceQuote : "";
        // The kind the extraction determined beats the one the form sends: the
        // profile form types every line as experience, which would file a
        // degree or a language under the wrong heading.
        const kind = proposal?.kind ?? f.kind;
        await tx`insert into jobbflow.candidate_facts
          (id,user_id,profile_version,kind,fact,source_quote,confirmed,grounded,source_document_id)
          values(${randomUUID()},${user.id},${row.version},${kind},${f.text},
            ${quote || null},true,${Boolean(quote)},${quote ? documentId : null})`;
      }
      return row.version;
    });
    return Response.json({ ok: true, version });
  } catch (e) {
    return errorResponse(e);
  }
}
