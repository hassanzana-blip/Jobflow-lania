# JobbFlow live setup — 19 September 2026

## Verified this session
- Source is in hassanzana-blip/Jobflow-lania on main.
- Supabase project yrquhmjpdsmxstcfqsht (jobpilot, eu-west-1) restored and healthy.
- Restoration temporarily returned an empty catalogue before the legacy database reappeared. The first migration attempt hit an existing enum and rolled back. No legacy tables were dropped or overwritten.
- Migration 20260919111905_jobbflow_isolated_schema.sql applied successfully: 37 tables, all RLS enabled; private jobbflow-candidate-documents bucket.
- Existing public schema, legacy auth trigger and existing account preserved. Existing legacy users are not automatically enrolled into JobbFlow.
- Transactional test on the real database verified new-user trigger, two-user read isolation and denial of direct quota-function execution. Test transaction rolled back.
- All server SQL explicitly addresses jobbflow.*; candidate data does not require exposing this schema through PostgREST. Auth remains Supabase Auth.
- Local 28 tests, TypeScript and production build passed after schema isolation. The regression test also asserts coexistence with a legacy public.profiles table.
- Password recovery request, callback and new-password UI added. Full email roundtrip and live account E2E are NOT verified.

## Deployment blockers
Netlify account sign-in succeeded. GitHub provider sign-in remains unfinished; browser was on GitHub password reset. No Netlify JobbFlow site created yet. Need server database connection and service credentials through secure environment variables, plus exact deployment origin and Supabase Auth redirect/SMTP configuration.

Netlify build: npm run build; publish .next; Node 24; main branch.
Use the migration in supabase/migrations. docs/legacy-migrations is archival only. The remote project also has four pre-existing migrations that belong to legacy jobpilot; do not reset the remote database or blindly push/pull conflicting migration histories.

## Service and API requirements
| Service | Configuration | Status / purpose |
|---|---|---|
| Supabase | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key accepted), DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY | Project and schema configured. Public key retrievable. Database URL and privileged key must be set securely in hosting; required for server workspace/storage. |
| Netlify | GitHub repository connection, APP_BASE_URL | Account access works; GitHub linking unfinished. No API token necessary with dashboard access. |
| Meta Model API | META_MODEL_API_KEY | Needed for muse-spark-1.3 Standard. Never Contributor for candidate data. Live provider test pending. |
| Resend | RESEND_API_KEY, RESEND_FROM; verified sender domain; Supabase SMTP settings | Transactional account email and future notifications. |
| Stripe | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_PLUS_PRICE_ID, STRIPE_PRO_PRICE_ID, STRIPE_AGENT_PRICE_ID | Test mode first; billing stays disabled until lifecycle tests pass. |
| Redis + worker hosting | REDIS_URL; persistent Node worker runtime | Daily searches, notification delivery and deletion jobs. Engineering still incomplete. |
| Document scanner | CLAMAV_HOST, CLAMAV_PORT | Isolated parsing is implemented and runs without it. The scanner itself is still missing, so uploads stay quarantined and cannot be downloaded again. |
| PostHog | NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST | Later, consent-based analytics with no candidate content. |
| Browser assistance | BROWSER_USE_API_KEY and permitted provider/executor | Later, explicit per-application approval; disabled. |
| JobSearch, JobAd Links, JobTech Taxonomy | Public endpoints configured | No secret keys required by current adapters. |

Secrets must never be stored in source, commits, frontend, logs or chat. Resend SMTP needs to be configured inside Supabase as well as the application email adapter.

## Supabase e-mail templates (must be changed before account flows work)

The callback no longer relies on PKCE. `@supabase/ssr` keeps the `code_verifier`
cookie in the browser that *asked* for the link, so a link opened on a phone
after being requested on a laptop could never be exchanged — it failed silently
and redirected to `/logga-in`. `/auth/callback` now redeems a `token_hash` with
`verifyOtp`, which is device independent, and still accepts `code` so links
already sitting in inboxes keep working.

Set each template's link in Supabase Auth → Email Templates to the matching URL:

| Template | Link |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` |
| Magic Link | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink` |
| Reset Password | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=reset-password` |
| Invite user | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite` |
| Change Email Address | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change` |

Until the templates are changed, Supabase keeps sending `?code=`, which still
works in the requesting browser and now lands on `/lankfel` with an explanation
instead of a silent redirect when it is opened elsewhere.

Also turn **click and open tracking off** for transactional mail in Resend.
Rewritten links (`r.us-east-1.awstrack.me`) are followed by link scanners and
mail-client prefetching, which burns the single-use token before the candidate
clicks it.

## CV upload, isolated parsing and scanning

`supabase/migrations/20260919160000_cv_upload_and_extraction.sql` adds the parse
state on `documents`, the `document_extractions` review table and the provenance
columns on `candidate_facts`. It is additive and does not touch the public
schema. Apply it before enabling uploads.

Uploading turns on by itself once `SUPABASE_SERVICE_ROLE_KEY` and
`NEXT_PUBLIC_SUPABASE_URL` are set — the private bucket needs the service role,
and the client never sees it. Without them the profile page says the feature is
not connected rather than offering a control that fails.

Parsing runs in a separate process (`scripts/parse-document.mjs`), spawned with
an environment built from scratch, a 256 MB heap cap and a 20 second kill. The
service-role key, `DATABASE_URL` and `META_MODEL_API_KEY` are therefore not
reachable from the code that opens a stranger's file.

**Malware scanning is not configured anywhere.** `CLAMAV_HOST` is empty, so every
upload is stored with `scan_state='quarantined'` and `GET /api/documents/url`
answers 409 for it. That is deliberate: a document that has not been positively
scanned is never served back out. The clamd INSTREAM client is written and its
protocol is covered by tests, so setting `CLAMAV_HOST` and `CLAMAV_PORT` is all
that is needed once a daemon exists. "Scanner unavailable" never counts as clean.

Function runtime: parsing spawns a child process and allows up to 60 seconds, so
the upload route needs a runtime that permits both. On Netlify this is a
standard Node function, not an edge one.

## Remaining work
Live signup/confirmation/login/logout/recovery; CV upload/scanning/extraction; contextual matching; daily ingest persistence (INGEST_PERSISTENCE_NOT_IMPLEMENTED); email outbox; billing lifecycle; browser assistance; admin and privacy verification; all specified mobile widths, visual/keyboard/axe E2E and production deployment.

Supabase advisors: no warning/error on new jobbflow tables/functions. INFO for server-only tables without client policies is intentional default-deny. Legacy public schema has existing function/extension/security-definer warnings, and leaked-password protection is disabled. These have not been silently modified. Review before sharing Auth with a public production release.
