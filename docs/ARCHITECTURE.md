# JobbFlow — architecture decision record

Status: implementation foundations, not a production release. Audit date: 19 September 2026.

This document describes the **target architecture**, not a list of completed features. Exact implementation coverage and known gaps are recorded in `DELIVERY-STATUS.md`.

## Product boundaries

JobbFlow is a candidate-controlled search and preparation product. It does not rank people for employers. Never submit, claim a submission, pay, accept terms, or answer sensitive application questions without explicit user review. An application approval is bound to immutable document versions and an exact payload hash, expires, and is single-use. Editing invalidates approval.

## Runtime topology

- Next.js 16.3.5 / React / TypeScript web application on a Node runtime in an EU region.
- Supabase EU PostgreSQL, Auth and private Storage. Drizzle for typed data access; SQL migrations are authoritative for constraints and RLS.
- Separate EU Node workers: BullMQ + Redis for ingest, matching, document parsing/rendering, email outbox and deletion. Jobs contain IDs only, never CV text.
- Isolated Python Browser Use / Playwright runner, feature flag off by default. Allowlisted integrations with documented permission; no bypasses, CAPTCHA solving or unrestricted LLM-controlled navigation.
- Muse Standard through a replaceable AIProvider, with validated structured output, bounded retries, token budgets and PII-free usage metrics.
- Stripe subscriptions and server-authoritative quotas; Resend for transactional mail; PostHog only through an explicit event/property allowlist.

The Sites Cloudflare runtime is not a host for persistent BullMQ processes or Python browsers. Do not silently replace PostgreSQL/Redis with SQLite or in-memory state to obtain a preview URL. Preview deployment and production deployment are separate readiness decisions.

## Provider audit

| Provider | Verified evidence | Contract / readiness |
|---|---|---|
| JobSearch | Official catalogue: public CC0, no API key/registration | Official Swagger and live responses now pinned in docs/contracts; source adapter and contract tests pass. |
| JobAd Links | Official catalogue: public CC0, no API key/registration, link-oriented coverage | `https://links.api.jobtechdev.se/` is the discovered service. Swagger and actual responses retrieved; adapter and contract tests pass. Excerpts link to original source. |
| Taxonomy | Official service exposes REST Swagger and GraphiQL | Official OpenAPI retrieved; v31 pinned; SSYK level 4 lookup verified live. |
| Meta Model API | Official docs confirm `https://api.meta.ai/v1`, Bearer auth and `muse-spark-1.3` Standard | API key and account data-processing configuration required. Contributor models forbidden. |
| Next.js | Official docs and npm registry both report 16.3.5 | Pin dependencies and lockfile; validate actual install/build. |
| Supabase / Stripe / Resend / PostHog / Redis | Selected architecture; no project credentials supplied | Provisioning and live integration tests outstanding. |

Sources:
- https://data.arbetsformedlingen.se/dataservice/jobsearch/
- https://data.arbetsformedlingen.se/dataservice/jobad-links/
- https://data.arbetsformedlingen.se/dataset/job-ads/
- https://taxonomy.api.jobtechdev.se/
- https://arbetsformedlingen.gitlab.io/taxonomy-dev/projects/jobtech-taxonomy/
- https://dev.meta.ai/docs/overview
- https://dev.meta.ai/docs/authentication
- https://dev.meta.ai/docs/pricing-rate-limits
- https://nextjs.org/docs/app

## Search and matching

Retrieve → normalize → exact deduplication → conservative duplicate candidates → cheap filters → structured shortlist → bounded deep analysis → persist evidence and score version.

Keep all source references. Merge on verified common external ID or canonical source URL. Similar employer/title/location/date only flags a possible duplicate: two vacancies may share all these fields. Do not silently collapse them without stronger evidence. Exclude expired/deleted ads. Record source fetch time and show partial-source failures instead of presenting partial results as complete market coverage.

Hard filters require explicit candidate preferences and explicit contradictory job data. Unknown remote, salary, language or certification data is not a negative fact. Never infer language requirements solely from the language in which an ad is written. Normalize skills and occupations through versioned taxonomy concepts, preserve raw source labels, and retain mappings for auditability.

Documented v1 weights: role 20, skills 20, relevant experience 15, seniority 10, industry 5, location 10, work style 5, employment 5, language 5, education/certifications 3, management 1, salary 1. Unknown factors are excluded from the score denominator and reduce coverage. Confidence is evidence coverage and provenance, not probability of getting hired. No headline score when coverage is under 50%; any verified critical blocker prevents a strong-match label. Store factor evidence and methodology version. User-confirmed facts only; age, name, gender, disability and nationality never affect scoring.

JobAd Links-only excerpts cannot support complete requirements analysis. Show limited evidence, omit unsupported factors, and offer the original advertisement. No automatic fetching of arbitrary source URLs until host permissions, SSRF protections and content rights are established.

## Truthful application generation

Candidate extraction produces a draft with source spans, unknown fields and confidence. Confirmation creates an immutable profile version. LLM content cannot write directly to tables. Every generated factual claim must cite IDs from that confirmed version. Dates, employer names, qualifications and numeric achievements are fixed protected fields. Deterministic validation rejects unknown evidence IDs, changed protected facts and unsupported numbers; review remains required because citations alone do not prove semantic truth.

Tailoring prioritizes confirmed content; original files never mutate. Store edits as new immutable versions and show a diff. Browser submission requires a fresh server-side approval bound to candidate, job, destination, payload and document hashes. Remote outcome uncertainty goes to manual review, never automatic retry of final submission. Allowed fallback is document download + deep link.

## Authentication and private documents

Supabase SSR cookie sessions; verify user server-side for each private request. Same-origin validation for mutations, secure HttpOnly cookies where supported by session flow, TLS, CSP with nonces, and an explicit OAuth redirect allowlist. RLS isolates every user-owned table. Service credentials remain in workers/server-only modules and never reach browser bundles.

Upload maximum 10 MiB. Validate extension, MIME and magic bytes. DOCX ZIP entry count, compressed/uncompressed size and ratio limits; reject macros, path traversal and external entities. Quarantine uploads in a private bucket until scanning and parsing succeed. Scanner unavailable means no processing. PDF parser limits: pages, text length, time and memory. No third-party document preview. Signed URLs require ownership check, short expiry and safe Content-Disposition; do not log URLs or filenames.

## Entitlements and billing

Central entitlements rows define Free/Plus/Pro/Agent limits. Usage reservation is atomic in PostgreSQL under an account-period lock. Unique operation IDs prevent duplicate charging. Reserve before work, settle on validated success, release on failure; concurrent workers cannot exceed quotas. Plan upgrades do not reset consumed usage. Billing periods come from Stripe, Free periods from UTC calendar months.

Webhook signature verification uses the raw request body. Durably store event IDs with unique constraint. Fetch authoritative subscription state when processing rather than applying out-of-order event deltas. Allowlist price IDs. Browser checkout success never grants access. Handle active, trialing if offered, past_due, unpaid, canceled, pause and refunds through explicit policy. Downgrades are scheduled and unused quota is not rolled over. Refund policy and tax-inclusive consumer prices require business review before selling.

## Scheduling and notifications

Daily searches default to Europe/Stockholm and use a per-user schedule key and lease. Candidate/profile version is part of the job ID. Re-check account state on every retry and before sending notifications. Frequency caps, quiet hours, new-match deduplication, unsubscribe/preferences and a transactional email outbox prevent duplicate or excessive mail. Delays are actual queue state, not animation.

## Privacy and deletion

Keep account, CV storage, extracted profile, generated applications, billing retention and analytics purposes separate. A privacy policy template is not legal approval. Review DPAs, subprocessors, international transfers, retention and lawful bases before launch. Standard-tier no-training documentation does not itself establish EU residency or zero retention.

Deletion first marks account deleting and revokes future work, then cancels pending notifications/jobs, deletes private object versions and derived drafts, deletes application/profile data, and finally removes Auth identity. An idempotent deletion ledger tracks retries and failures. Purge caches and any provider-hosted files. Retained billing records must have a documented legal basis and restricted access. Backups need a documented expiry and restoration tombstone process. Download export is authenticated and private, expires, and never goes to analytics.

## Observability and administration

Only log operation, opaque run ID, model, input/cached/output tokens, latency, outcome and cost version. No prompt, CV text, address, email, document name, answers or signed URL. Admin RBAC is server-owned; cost/health dashboards aggregate by default. Sensitive access needs a reason and immutable audit event. PII-free analytics uses an allowlist and consent rules, without autocapture/session replay on private candidate flows.

## Production gates

Live API contracts pinned; EU services configured; migrations and two-user RLS tests passed; verified auth callbacks; file quarantine/scanning tests; quota concurrency and webhook replay/out-of-order tests; extraction truthfulness tests; all 17 user acceptance steps; 320–430 px mobile and desktop E2E; keyboard/screen reader and automated accessibility checks; Lighthouse measurements; visual comparison against Figma; restoration/deletion drill; alerting; provider terms and privacy documentation reviewed. Until these pass, label the delivery incomplete and keep paid checkout and browser submission disabled.
