# JobbFlow mobile release — 19 September 2026

This is a substantial implementation update, not a production launch. The full original product brief remains the acceptance target.

## What changed

The app now shares one responsive interface between the authenticated workspace, the public live job browser and the clearly labelled example. It uses the supplied mobile references: cream canvas, sage cards, dark forest navigation, lime actions, four labelled bottom destinations, 48px targets, safe-area spacing and accessible Radix sheets. Desktop gains a persistent sidebar and a grid of readable job cards.

Implemented user interactions: filter/search, job details, source links, save/unsave, dismiss/undo, three-step manual profile confirmation, taxonomy occupation lookup, application list/status/notes/interview/follow-up dates, draft creation, comparison with confirmed profile, editing, review confirmation and downloadable PDF. No application is submitted automatically.

Profile changes create a new fact version in a database transaction. Application/status updates detect stale writes. Editing a reviewed document creates a new immutable document version and detects concurrent edits. Draft generation uses short database leases, server quota reservations, release on failure and settlement on success. Provider usage metrics exclude candidate text.

Auth now supports password and magic-link UI, logout and SSR session refresh. Missing Supabase configuration does not create fake accounts.

## Actual job data

The official JobSearch Swagger, JobAd Links Swagger, taxonomy OpenAPI and response samples are checked into `docs/contracts`. Both job adapters fetched 50 live results in this environment. Taxonomy v31 returned the HR manager and HR specialist occupation groups. Contract tests cover actual saved responses, URL safety, duplicate cross-feed vacancies, query parameter names and malformed responses. JobAd Links is always an excerpt with an original-source link. Retrieved jobs have no invented match score. Full contextual ranking is still pending.

Unzoned upstream date-times are normalized as Europe/Stockholm civil time; the UI displays calendar dates. This assumption is documented and tested, but should be confirmed with JobTech before time-critical deadline automation.

## Verification

- Native production build and TypeScript pass.
- Static Netlify preview export passes.
- 28 tests pass, including migrations executed in PGlite/PostgreSQL, two-user RLS, denied paid-plan tampering, private storage metadata, quota ceiling, cascading deletion, model schema failures, source normalization and multi-page Swedish PDF.
- Tests exposed and fixed an invalid reserved SQL column (`current_role` became `is_current`) and a variable-font PDF failure (static Inter font now embedded).
- Live JobSearch, JobAd Links and taxonomy adapter smoke checks pass.
- Playwright viewport, app flow, keyboard dialog and axe tests are authored. They have NOT run here: controlled browser navigation to the supervised local preview is blocked with `ERR_BLOCKED_BY_CLIENT`.
- No Lighthouse score, visual parity or phone-browser pass is claimed.

## External connections still needed

Native Next.js deployment in Netlify; EU Supabase project, all three migrations and Auth redirects; PostgreSQL connection and private service credentials; Muse Standard key for model-assisted drafts; worker/Redis, email and Stripe services for their respective features. Set secrets in Netlify, never in public code or this chat.

## Engineering still required

Secure CV file processing and extraction confirmation; resumable unfinished onboarding; contextual matching and background match persistence; daily job search and email delivery; full billing lifecycle, refund/period-transition tests; production queue recovery (including abandoned AI reservations); admin UI; consent analytics; comprehensive GDPR retention/export; browser assistance. CV upload, alerts, billing and browser submission are not advertised as working in the app. Dates in the tracker are stored but email reminders are not sent.

Connecting credentials alone does not finish these requirements. The 17-step real candidate acceptance journey has not passed. Production launch remains blocked until the full acceptance, security, accessibility and deployment gates pass.
