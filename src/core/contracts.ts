import { z } from "zod";

export const FactSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum([
      "role",
      "skill",
      "experience",
      "education",
      "language",
      "certification",
      "achievement",
    ]),
    text: z.string().min(1).max(2000),
    sourceQuote: z.string().max(2500),
    confirmed: z.boolean(),
  })
  .strict();
export const CandidateExtractionSchema = z
  .object({
    name: z.string().max(200).nullable(),
    location: z.string().max(200).nullable(),
    facts: z.array(FactSchema.omit({ confirmed: true })).max(200),
    unknowns: z.array(z.string().max(500)).max(30),
  })
  .strict();
export const PreferencesSchema = z
  .object({
    roles: z.array(z.string().min(1).max(120)).max(10),
    occupationIds: z.array(z.string().max(100)).max(20),
    locations: z.array(z.string().max(150)).max(20),
    workStyle: z.enum(["any", "remote", "hybrid", "onsite"]),
    employment: z.array(z.string().max(100)).max(10),
    minimumSalary: z.number().int().positive().nullable(),
    excludedTitles: z.array(z.string().min(1).max(120)).max(30),
    excludedCompanies: z.array(z.string().min(1).max(120)).max(30),
    willingToRelocate: z.boolean(),
    languages: z.array(z.string().max(100)).max(20),
  })
  .strict();
export type Preferences = z.infer<typeof PreferencesSchema>;
export const CandidateSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    confirmedAt: z.string().datetime(),
    facts: z.array(FactSchema).max(200),
    preferences: PreferencesSchema,
  })
  .strict();
export type Candidate = z.infer<typeof CandidateSchema>;

export const FactorKeySchema = z.enum([
  "role",
  "skills",
  "experience",
  "seniority",
  "industry",
  "location",
  "workStyle",
  "employment",
  "language",
  "education",
  "management",
  "salary",
]);
export type FactorKey = z.infer<typeof FactorKeySchema>;
export const FactorSchema = z
  .object({
    key: FactorKeySchema,
    value: z.number().min(0).max(1).nullable(),
    evidenceIds: z.array(z.string().max(100)).max(30),
    reason: z.string().max(1000),
    source: z.enum(["deterministic", "ai", "unknown"]),
    blocker: z.boolean(),
  })
  .strict();
export const JobMatchSchema = z
  .object({
    factors: z.array(FactorSchema).max(12),
    summary: z.string().max(1200),
    gaps: z.array(z.string().max(500)).max(10),
  })
  .strict();
export const ApplicationDraftSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            heading: z.string().max(100),
            sentences: z
              .array(
                z
                  .object({
                    text: z.string().max(1000),
                    evidenceIds: z.array(z.string().max(100)).min(1).max(20),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .max(15),
    questionsForCandidate: z.array(z.string().max(500)).max(15),
  })
  .strict();
export const ApplicationQuestionSchema = z
  .object({
    answer: z.string().max(2000).nullable(),
    evidenceIds: z.array(z.string().max(100)).max(20),
    needsCandidateInput: z.boolean(),
    reason: z.string().max(500),
  })
  .strict();
export type ApplicationDraft = z.infer<typeof ApplicationDraftSchema>;

/**
 * What the model returned, plus the score derived from it by code. The
 * separation is deliberate: a provider may propose factors and evidence, but
 * the number a candidate sees is always computed from the weighted method.
 */
export type ScoredMatch = z.infer<typeof JobMatchSchema> & {
  score: number | null;
  coverage: number;
  confidence: string;
  strong: boolean;
  blockers: z.infer<typeof FactorSchema>[];
  methodVersion: string;
};

// Internal canonical model, NOT an assumed upstream API schema.
export const JobSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["jobsearch", "jobadlinks"]),
  externalId: z.string().min(1),
  canonicalUrl: z.url(),
  sourceUrl: z.url(),
  title: z.string().min(1),
  employer: z.string().nullable(),
  municipalityId: z.string().nullable(),
  location: z.string().nullable(),
  occupationIds: z.array(z.string()),
  publishedAt: z.string().datetime(),
  deadline: z.string().datetime().nullable(),
  removed: z.boolean(),
  description: z.string(),
  descriptionCompleteness: z.enum(["full", "excerpt"]),
  workStyle: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  employment: z.string().nullable(),
  salaryMaximumSek: z.number().positive().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export interface JobSource {
  readonly name: "jobsearch" | "jobadlinks";
  search(input: {
    query: string;
    occupationIds: string[];
    municipalityIds: string[];
    since?: string;
    cursor?: string;
  }): Promise<{ jobs: Job[]; nextCursor?: string; fetchedAt: string }>;
  get(externalId: string): Promise<Job | null>;
}
export interface TaxonomySource {
  search(
    term: string,
    type: "occupation" | "skill" | "municipality",
  ): Promise<{ id: string; label: string; version: string }[]>;
  related(id: string): Promise<{ id: string; relation: string }[]>;
}
export interface AIProvider {
  analyseCandidate(
    text: string,
  ): Promise<z.infer<typeof CandidateExtractionSchema>>;
  scoreJob(candidate: Candidate, job: Job): Promise<ScoredMatch>;
  explainMatch(candidate: Candidate, job: Job): Promise<ScoredMatch>;
  tailorCV(candidate: Candidate, job: Job): Promise<ApplicationDraft>;
  createCoverLetter(candidate: Candidate, job: Job): Promise<ApplicationDraft>;
  answerApplicationQuestion(
    candidate: Candidate,
    question: string,
  ): Promise<z.infer<typeof ApplicationQuestionSchema>>;
  browserReasoning(context: {
    fieldLabels: string[];
    allowedActions: string[];
  }): Promise<{ suggestion: string; requiresApproval: boolean }>;
}
