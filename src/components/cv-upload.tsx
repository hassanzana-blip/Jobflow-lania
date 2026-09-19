"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, Upload } from "lucide-react";
import { mobileSv as t } from "@/i18n/mobile-sv";
import type { ExtractionReview, ReviewFact } from "@/core/extraction";
import type { ParseFailure } from "@/core/document-parse";

export type ConfirmedExtraction = {
  extractionId: string;
  name: string | null;
  location: string | null;
  facts: { text: string }[];
};

type Upload = {
  extractionId: string;
  scanState: string;
  truncated: boolean;
  review: ExtractionReview;
};

/**
 * Upload a CV, then check what was read out of it.
 *
 * The review is the product decision here, not a formality. Every proposal
 * arrives marked with whether its quote was actually found in the uploaded
 * document, unverified ones start unticked, and the quote is shown next to the
 * claim so the candidate can see what it rests on. Editing a proposal is
 * expected; the server drops the quote when the wording changes, so a corrected
 * line is recorded as the candidate's own statement rather than as something
 * the document said.
 *
 * Nothing here saves anything. It hands the reviewed facts up to the profile
 * form, where the candidate confirms them in one explicit step.
 */
export function CvUpload({
  enabled,
  aiConfigured,
  onConfirm,
}: {
  enabled: boolean;
  aiConfigured: boolean;
  onConfirm: (result: ConfirmedExtraction) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ParseFailure | null>(null);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<Upload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);
  const banner = useRef<HTMLDivElement>(null);

  // An unfinished review survives a reload: the candidate picks up where they
  // were instead of uploading the same document again.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.pending) return;
        apply({
          extractionId: body.pending.id,
          scanState: "quarantined",
          truncated: Boolean(body.pending.truncated),
          review: body.pending.review,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (failure || error) banner.current?.scrollIntoView({ block: "center" });
  }, [failure, error]);

  function apply(next: Upload) {
    setUpload(next);
    setFailure(null);
    setDrafts(Object.fromEntries(next.review.facts.map((f) => [f.id, f.text])));
    setSelected(Object.fromEntries(next.review.facts.map((f) => [f.id, f.selected])));
  }

  async function send(file: File) {
    setBusy(true);
    setError("");
    setFailure(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/documents", { method: "POST", body });
      const data = await response.json();
      if (response.status === 422 && typeof data.parseFailed === "string") {
        setFailure(data.parseFailed as ParseFailure);
        return;
      }
      if (!response.ok) throw new Error(data.error ?? t.error);
      apply(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (!enabled)
    return (
      <div className="jf-upload-card">
        <FileText size={30} strokeWidth={1.4} />
        <h2>{t.uploadTitle}</h2>
        <p>{t.uploadBody}</p>
        <span>{t.uploadUnavailable}</span>
        <p>{t.manualEntry}</p>
      </div>
    );

  const facts = upload?.review.facts ?? [];
  const chosen = facts.filter((f) => selected[f.id] && drafts[f.id]?.trim());

  return (
    <div className="jf-upload-card">
      <FileText size={30} strokeWidth={1.4} />
      <h2>{t.cv.title}</h2>
      <p>{t.cv.body}</p>

      <div ref={banner}>
        {failure && (
          <p className="jf-notice jf-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            {t.cv.parseFailed[failure]}
          </p>
        )}
        {error && (
          <p className="jf-notice jf-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <label className="jf-upload-input">
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <span className="jf-secondary">
          <Upload size={18} aria-hidden="true" />
          {upload ? t.cv.replace : t.cv.choose}
        </span>
      </label>
      <p className="jf-status" role="status" aria-live="polite">
        {busy ? t.cv.uploading : ""}
      </p>

      {upload && (
        <section className="jf-review" aria-label={t.cv.reviewTitle}>
          <h3>{t.cv.reviewTitle}</h3>
          <p>{t.cv.reviewBody}</p>
          {upload.truncated && <p className="jf-notice">{t.cv.truncated}</p>}
          {upload.scanState !== "clean" && (
            <p className="jf-notice">{t.cv.quarantined}</p>
          )}
          {!facts.length && (
            <p className="jf-notice">
              {aiConfigured ? t.cv.nothingProposed : t.cv.noModel}
            </p>
          )}

          <ul className="jf-review-list">
            {facts.map((fact: ReviewFact) => (
              <li key={fact.id} className={fact.grounded ? "" : "jf-uncertain"}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[fact.id])}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [fact.id]: e.target.checked }))
                    }
                  />
                  <span className="jf-review-badge">
                    {fact.grounded ? (
                      <>
                        <Check size={15} aria-hidden="true" />
                        {t.cv.grounded}
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={15} aria-hidden="true" />
                        {t.cv.ungrounded}
                      </>
                    )}
                  </span>
                </label>
                <label className="jf-field">
                  <span className="jf-visually-hidden">{t.cv.editLabel}</span>
                  <input
                    value={drafts[fact.id] ?? ""}
                    maxLength={2000}
                    aria-describedby={`quote-${fact.id}`}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [fact.id]: e.target.value }))
                    }
                  />
                </label>
                <p id={`quote-${fact.id}`} className="jf-review-quote">
                  {fact.grounded ? (
                    <>
                      <strong>{t.cv.quoteLabel}:</strong> “{fact.sourceQuote}”
                    </>
                  ) : (
                    t.cv.ungroundedHelp
                  )}
                </p>
              </li>
            ))}
          </ul>

          {upload.review.unknowns.length > 0 && (
            <>
              <h4>{t.cv.unknownsTitle}</h4>
              <ul className="jf-review-unknowns">
                {upload.review.unknowns.map((unknown) => (
                  <li key={unknown}>{unknown}</li>
                ))}
              </ul>
            </>
          )}

          <button
            type="button"
            className="jf-primary"
            disabled={!chosen.length}
            onClick={() =>
              onConfirm({
                extractionId: upload.extractionId,
                name: upload.review.proposedName,
                location: upload.review.proposedLocation,
                facts: chosen.map((fact) => ({ text: drafts[fact.id].trim() })),
              })
            }
          >
            {t.cv.confirm}
          </button>
          <p className="form-hint">{t.cv.confirmHint}</p>
        </section>
      )}
    </div>
  );
}
