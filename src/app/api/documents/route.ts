import { requireUser } from "@/server/supabase";
import { database } from "@/server/db";
import { mutationGuard, errorResponse } from "@/server/request";
import { rateLimit } from "@/server/limits";
import {
  storeUpload,
  saveExtraction,
  pendingExtraction,
  reviewFor,
  scanConfigured,
} from "@/server/documents";
import { reviewFromExtraction } from "@/core/extraction";
import { MAX_UPLOAD_BYTES } from "@/core/security";
import { MuseProvider } from "@/core/muse";

export const maxDuration = 60;

/** Resume an unfinished review rather than making the candidate upload again. */
export async function GET() {
  try {
    const { user } = await requireUser();
    const pending = await pendingExtraction(user.id);
    return Response.json(
      { pending, scanConfigured: scanConfigured() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Takes one CV, stores it privately, parses it away from this process and
 * proposes facts for the candidate to check.
 *
 * Nothing here writes a fact. The answer is a review: proposals, each marked
 * with whether its quote was actually found in the uploaded document. The
 * candidate corrects it and confirms through `/api/profile`, which is the only
 * path that turns any of this into profile data.
 */
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    await rateLimit(user.id, "document_upload", 5, 3600);

    // Cheap rejection before the body is read into memory. The real check is
    // on the bytes themselves, since this header is caller-supplied.
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 4096) throw new Error("INVALID_FILE_SIZE");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("BODY_REQUIRED");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("INVALID_FILE_SIZE");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const stored = await storeUpload({
      userId: user.id,
      bytes,
      mime: file.type,
      filename: file.name,
    });
    if (!stored.parse.ok)
      return Response.json(
        { documentId: stored.documentId, parseFailed: stored.parse.reason },
        { status: 422, headers: { "Cache-Control": "private, no-store" } },
      );

    const sql = database();
    const [profile] =
      await sql`select version from jobbflow.profiles where user_id=${user.id} and state='active'`;
    if (!profile) throw new Error("ACCOUNT_NOT_ACTIVE");

    const key = process.env.META_MODEL_API_KEY;
    let review;
    if (key) {
      const metrics: Parameters<
        NonNullable<ConstructorParameters<typeof MuseProvider>[0]["observe"]>
      >[0][] = [];
      const provider = new MuseProvider({ key, observe: (m) => metrics.push(m) });
      try {
        review = await reviewFor(
          (text) => provider.analyseCandidate(text),
          stored.parse.text,
        );
      } finally {
        for (const m of metrics)
          await sql`insert into jobbflow.model_usage(operation,model,input_tokens,cached_tokens,output_tokens,latency_ms,success,estimated_usd) values(${m.operation},${m.model},${m.inputTokens},${m.cachedTokens},${m.outputTokens},${m.latencyMs},${m.success},${m.estimatedUsd})`;
      }
    } else {
      // Without a model the document is still stored and read; there is simply
      // nothing proposed, and the candidate fills the profile in by hand.
      review = reviewFromExtraction(
        { name: null, location: null, facts: [], unknowns: [] },
        stored.parse.text,
      );
    }

    const extractionId = await saveExtraction({
      userId: user.id,
      documentId: stored.documentId,
      profileVersion: profile.version,
      review,
    });
    return Response.json(
      {
        extractionId,
        documentId: stored.documentId,
        scanState: stored.scanState,
        truncated: stored.parse.truncated,
        pages: stored.parse.pages,
        review,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
