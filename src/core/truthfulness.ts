import {
  ApplicationDraftSchema,
  type ApplicationDraft,
  type Candidate,
} from "./contracts.ts";

export function validateDraft(
  raw: unknown,
  candidate: Candidate,
): ApplicationDraft {
  const draft = ApplicationDraftSchema.parse(raw);
  const facts = new Map(
    candidate.facts.filter((f) => f.confirmed).map((f) => [f.id, f]),
  );
  for (const section of draft.sections)
    for (const sentence of section.sentences) {
      if (sentence.evidenceIds.some((id) => !facts.has(id)))
        throw new Error("Draft references an unconfirmed fact");
      const evidence = sentence.evidenceIds
        .map((id) => facts.get(id)!.text)
        .join(" ");
      const claimedNumbers = sentence.text.match(/\d+(?:[.,]\d+)?/g) ?? [];
      const sourceNumbers = new Set(evidence.match(/\d+(?:[.,]\d+)?/g) ?? []);
      if (claimedNumbers.some((n) => !sourceNumbers.has(n)))
        throw new Error("Unsupported numeric claim");
    }
  // A schema/evidence check is not semantic proof. Every draft still needs review.
  return draft;
}
