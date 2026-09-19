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
| Document scanner | CLAMAV_HOST, CLAMAV_PORT; isolated parsing runtime | Secure PDF/DOCX processing; not yet implemented. |
| PostHog | NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST | Later, consent-based analytics with no candidate content. |
| Browser assistance | BROWSER_USE_API_KEY and permitted provider/executor | Later, explicit per-application approval; disabled. |
| JobSearch, JobAd Links, JobTech Taxonomy | Public endpoints configured | No secret keys required by current adapters. |

Secrets must never be stored in source, commits, frontend, logs or chat. Resend SMTP needs to be configured inside Supabase as well as the application email adapter.

## Remaining work
Live signup/confirmation/login/logout/recovery; CV upload/scanning/extraction; contextual matching; daily ingest persistence (INGEST_PERSISTENCE_NOT_IMPLEMENTED); email outbox; billing lifecycle; browser assistance; admin and privacy verification; all specified mobile widths, visual/keyboard/axe E2E and production deployment.

Supabase advisors: no warning/error on new jobbflow tables/functions. INFO for server-only tables without client policies is intentional default-deny. Legacy public schema has existing function/extension/security-definer warnings, and leaked-password protection is disabled. These have not been silently modified. Review before sharing Auth with a public production release.
