import { z } from "zod";
import { CandidateExtractionSchema, FactSchema } from "./contracts.ts";

/**
 * Turns what the model proposed about a CV into something a candidate can
 * check, correct and sign off.
 *
 * The rule here is that uncertainty is *measured*, not asked for. A model can
 * be told to flag its own doubt and will still sound confident about an
 * employer it invented, so this module ignores any such self-report and does
 * one deterministic thing instead: it looks for the quote in the document the
 * candidate actually uploaded. A fact whose quote is there is `grounded`;
 * anything else is shown as unverified and starts out unselected, so the
 * candidate has to make a decision before it can become part of their profile.
 *
 * Nothing in here writes anything. Confirmation is a separate, explicit step.
 */
export type ReviewFact = z.infer<typeof FactSchema> & {
  /** The quote was found in the uploaded document, character for character. */
  grounded: boolean;
  /** Pre-ticked for grounded facts only; the candidate decides the rest. */
  selected: boolean;
};

export type ExtractionReview = {
  proposedName: string | null;
  proposedLocation: string | null;
  facts: ReviewFact[];
  /** What the document did not say. Shown as gaps, never guessed at. */
  unknowns: string[];
  groundedCount: number;
  ungroundedCount: number;
};

export const MAX_REVIEW_FACTS = 100;
/** A quote shorter than this proves nothing: "HR" appears in any CV. */
export const MIN_QUOTE_CHARS = 8;

/**
 * Both sides are folded the same way before comparison, because a PDF text
 * layer breaks lines wherever the page did. Only whitespace and case are
 * normalised — letters are never dropped, so the check cannot be loosened into
 * matching text the document does not contain.
 */
export function foldForComparison(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("sv-SE");
}

/** Whether this exact quote appears in the document the candidate uploaded. */
export function quoteIsGrounded(quote: string, documentText: string) {
  const folded = foldForComparison(quote);
  if (folded.length < MIN_QUOTE_CHARS) return false;
  return foldForComparison(documentText).includes(folded);
}

export function reviewFromExtraction(
  extraction: z.infer<typeof CandidateExtractionSchema>,
  documentText: string,
): ExtractionReview {
  const facts: ReviewFact[] = extraction.facts
    .slice(0, MAX_REVIEW_FACTS)
    .map((fact) => {
      const grounded = quoteIsGrounded(fact.sourceQuote, documentText);
      return {
        ...fact,
        // An unverified quote is worse than none: it reads as evidence while
        // pointing at text the document never contained.
        sourceQuote: grounded ? fact.sourceQuote : "",
        grounded,
        selected: grounded,
        confirmed: false,
      };
    });
  return {
    proposedName: extraction.name,
    proposedLocation: extraction.location,
    facts,
    unknowns: extraction.unknowns,
    groundedCount: facts.filter((fact) => fact.grounded).length,
    ungroundedCount: facts.filter((fact) => !fact.grounded).length,
  };
}

/** The rows stored for a pending review, and read back to resume one. */
export const StoredReviewFactSchema = FactSchema.extend({
  grounded: z.boolean(),
  selected: z.boolean(),
}).strict();

export const StoredReviewSchema = z
  .object({
    proposedName: z.string().max(200).nullable(),
    proposedLocation: z.string().max(200).nullable(),
    facts: z.array(StoredReviewFactSchema).max(MAX_REVIEW_FACTS),
    unknowns: z.array(z.string().max(500)).max(30),
    groundedCount: z.number().int().nonnegative(),
    ungroundedCount: z.number().int().nonnegative(),
  })
  .strict();

/**
 * The facts a candidate confirmed, re-checked against the document before they
 * are written. A candidate may edit a proposal freely — that is the point of
 * the review — but an edited fact loses the quote that backed it, because the
 * quote no longer supports the new wording.
 */
export function factsToConfirm(
  review: ExtractionReview,
  decisions: { id: string; text: string; include: boolean }[],
  documentText: string,
) {
  const byId = new Map(review.facts.map((fact) => [fact.id, fact]));
  const confirmed: (z.infer<typeof FactSchema> & { grounded: boolean })[] = [];
  for (const decision of decisions) {
    const original = byId.get(decision.id);
    if (!original || !decision.include) continue;
    const text = decision.text.trim();
    if (!text) continue;
    const unchanged = text === original.text.trim();
    // Re-derived, never carried over: an edit that no longer matches the
    // document is the candidate's own statement, and is recorded as such.
    const grounded =
      unchanged && original.grounded && quoteIsGrounded(original.sourceQuote, documentText);
    confirmed.push({
      id: original.id,
      kind: original.kind,
      text,
      sourceQuote: grounded ? original.sourceQuote : "",
      confirmed: true,
      grounded,
    });
  }
  return confirmed;
}
