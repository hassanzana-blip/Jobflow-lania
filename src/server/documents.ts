import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { connect } from "node:net";
import { database } from "./db";
import { serviceClient } from "./supabase";
import { parseDocumentBytes } from "./document-parser";
import { objectKeyFor, safeDisplayName, validateUpload } from "@/core/security";
import {
  instreamFrames,
  readScanReply,
  type ScanVerdict,
} from "@/core/clamav";
import { reviewFromExtraction, StoredReviewSchema } from "@/core/extraction";
import type { ExtractionReview } from "@/core/extraction";
import type { ParseResult } from "@/core/document-parse";
import { CandidateExtractionSchema } from "@/core/contracts";

export const DOCUMENT_BUCKET = "jobbflow-candidate-documents";
/** Long enough to open a CV, short enough that a leaked link is stale fast. */
export const SIGNED_URL_SECONDS = 120;

export function scanConfigured() {
  return Boolean(process.env.CLAMAV_HOST);
}

/**
 * Streams the bytes to clamd. Returns `unavailable` rather than throwing when
 * the daemon is missing or slow — the caller's policy is that anything not
 * positively clean stays quarantined, so a scanner outage degrades the feature
 * instead of failing the upload.
 */
export function scanBytes(bytes: Uint8Array): Promise<ScanVerdict> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return Promise.resolve({ state: "unavailable", detail: "not configured" });
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  return new Promise((resolve) => {
    let settled = false;
    const done = (verdict: ScanVerdict) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(verdict);
    };
    const socket = connect({ host, port });
    socket.setTimeout(15_000, () => done({ state: "unavailable", detail: "timeout" }));
    socket.on("error", (error) => done({ state: "unavailable", detail: error.message }));
    let reply = "";
    socket.on("data", (chunk) => {
      reply += chunk.toString("utf8");
      if (reply.includes("\0") || reply.includes("\n")) done(readScanReply(reply));
    });
    socket.on("close", () => done(readScanReply(reply)));
    socket.on("connect", () => {
      for (const frame of instreamFrames(bytes)) socket.write(Buffer.from(frame));
    });
  });
}

export type StoredDocument = {
  documentId: string;
  scanState: "quarantined" | "clean" | "rejected";
  parse: ParseResult;
};

/**
 * Validates, scans, stores and parses one upload.
 *
 * Order matters. The bytes are checked and scanned before anything is written,
 * the row is created quarantined, and parsing happens in a separate process
 * afterwards — so a file that turns out to be hostile has never been trusted,
 * and a file that cannot be parsed still exists for the candidate to replace.
 */
export async function storeUpload(input: {
  userId: string;
  bytes: Uint8Array;
  mime: string;
  filename: string;
}): Promise<StoredDocument> {
  const { kind } = validateUpload(input.bytes, input.mime, input.filename);
  const verdict = await scanBytes(input.bytes);
  if (verdict.state === "infected") throw new Error("FILE_REJECTED");
  // Positively clean, or quarantined. "Scanner unavailable" is never "clean".
  const scanState = verdict.state === "clean" ? "clean" : "quarantined";

  const key = objectKeyFor(input.userId, kind);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storage = serviceClient().storage.from(DOCUMENT_BUCKET);
  const { error } = await storage.upload(key, Buffer.from(input.bytes), {
    contentType: input.mime,
    upsert: false,
  });
  if (error) throw new Error("STORAGE_UNAVAILABLE");

  const sql = database();
  let documentId: string;
  try {
    const [row] = await sql`
      insert into jobbflow.documents
        (user_id,object_key,mime_type,size_bytes,sha256,scan_state,original_name)
      values (${input.userId},${key},${input.mime},${input.bytes.length},${sha256},${scanState},${safeDisplayName(input.filename)})
      returning id`;
    documentId = row.id;
  } catch (dbError) {
    // Never leave an object behind that no row owns: it would be invisible to
    // export and to deletion.
    await storage.remove([key]).catch(() => {});
    throw dbError;
  }

  const parse = await parseDocumentBytes(input.bytes, kind);
  await sql`
    update jobbflow.documents set
      parse_state=${parse.ok ? "parsed" : "failed"},
      parse_reason=${parse.ok ? null : parse.reason},
      page_count=${parse.ok ? parse.pages : null},
      text_chars=${parse.ok ? parse.text.length : null},
      text_truncated=${parse.ok ? parse.truncated : false}
    where id=${documentId} and user_id=${input.userId}`;
  return { documentId, scanState, parse };
}

/**
 * A short-lived link to the candidate's own file.
 *
 * Only a document that was positively scanned clean is ever handed back. With
 * no scanner configured nothing qualifies, which is the honest outcome: the
 * product does not have malware scanning yet, so it does not serve uploads
 * back out as if it did.
 */
export async function signedDocumentUrl(userId: string, documentId: string) {
  const sql = database();
  const [document] = await sql`
    select object_key,scan_state from jobbflow.documents
    where id=${documentId} and user_id=${userId}`;
  if (!document) throw new Error("NOT_FOUND");
  if (document.scan_state !== "clean") throw new Error("DOCUMENT_QUARANTINED");
  const { data, error } = await serviceClient()
    .storage.from(DOCUMENT_BUCKET)
    .createSignedUrl(document.object_key, SIGNED_URL_SECONDS);
  if (error || !data) throw new Error("STORAGE_UNAVAILABLE");
  return { url: data.signedUrl, expiresInSeconds: SIGNED_URL_SECONDS };
}

/** Stores a pending review so a reload does not lose the candidate's place. */
export async function saveExtraction(input: {
  userId: string;
  documentId: string;
  profileVersion: number;
  review: ExtractionReview;
}) {
  const sql = database();
  const [row] = await sql`
    insert into jobbflow.document_extractions
      (user_id,document_id,profile_version,proposed_name,proposed_location,facts,unknowns,grounded_count,ungrounded_count)
    values (${input.userId},${input.documentId},${input.profileVersion},
      ${input.review.proposedName},${input.review.proposedLocation},
      ${sql.json(input.review.facts)},${sql.json(input.review.unknowns)},
      ${input.review.groundedCount},${input.review.ungroundedCount})
    returning id`;
  return row.id as string;
}

/** The candidate's most recent unconfirmed review, if there is one. */
export async function pendingExtraction(userId: string) {
  const sql = database();
  const [row] = await sql`
    select e.id,e.document_id,e.proposed_name,e.proposed_location,e.facts,e.unknowns,
           e.grounded_count,e.ungrounded_count,d.original_name,d.text_truncated
    from jobbflow.document_extractions e
    join jobbflow.documents d on d.id=e.document_id and d.user_id=e.user_id
    where e.user_id=${userId} and e.confirmed_at is null
    order by e.created_at desc limit 1`;
  if (!row) return null;
  const review = StoredReviewSchema.safeParse({
    proposedName: row.proposed_name,
    proposedLocation: row.proposed_location,
    facts: row.facts,
    unknowns: row.unknowns,
    groundedCount: row.grounded_count,
    ungroundedCount: row.ungrounded_count,
  });
  if (!review.success) return null;
  return {
    id: row.id as string,
    documentId: row.document_id as string,
    filename: (row.original_name as string | null) ?? "",
    truncated: Boolean(row.text_truncated),
    review: review.data,
  };
}

/**
 * Runs the model over the extracted text and turns the answer into a review.
 * The text is data, never instruction — the provider's system prompt says so,
 * and every proposed fact is checked against the document here regardless.
 */
export async function reviewFor(
  analyse: (text: string) => Promise<unknown>,
  documentText: string,
) {
  const extraction = CandidateExtractionSchema.parse(await analyse(documentText));
  return reviewFromExtraction(extraction, documentText);
}
