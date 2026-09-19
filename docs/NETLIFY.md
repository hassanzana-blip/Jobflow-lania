> Current deployment status: see [LIVE-SETUP.md](LIVE-SETUP.md). JobbFlow now uses the isolated `jobbflow` schema; historical public-schema migrations must not be deployed.

# Netlify delivery

## Complete source — real server features

`JobbFlow-Source-v2.zip` contains the current complete Next.js source (the filename is preserved across updates). Extract it, put its contents in a Git repository, and connect that repository to Netlify. Do not use Netlify Drop for this source archive.

`netlify.toml` uses `npm run build`, publish directory `.next`, Node 24. Netlify's OpenNext adapter runs the server routes. Public `/hitta-jobb` uses actual JobTech APIs with no secret key. Registration and private workspace need the service configuration below.

Minimum configuration for accounts and database-backed profiles/tracker:

1. Create an EU Supabase project. Run migrations `0001_core.sql`, `0002_workspace.sql`, `0003_generation_leases.sql` in order.
2. In Netlify environment variables, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` (Supabase transaction pooler connection). Keep service/database secrets server-only.
3. Set `APP_BASE_URL` to your exact HTTPS Netlify/custom-domain origin. Add `/auth/callback` for that origin to the Supabase Auth redirect allowlist. Configure email verification and a working sender.
4. Redeploy after changing public environment variables.
5. Validate signup, email callback, login, session refresh, two-user isolation, profile, save/dismiss and tracker in the deployed environment before accepting real candidate data.

Muse Standard drafts use `META_MODEL_API_KEY`. Without that key, the app explicitly creates a manual underlay from confirmed profile facts. It never labels that underlay AI-tailored. Live contextual match scores are not implemented yet.

Keep billing, browser assistance and account deletion disabled until their service-specific tests/drills pass. The background worker/dispatcher need a separate persistent runtime and Redis; they are not hosted by Netlify web functions. CV upload/extraction and the remaining product features still require engineering; setting variables alone does not enable them.

## Visual mobile preview — Netlify Drop

`JobbFlow-Netlify.zip` contains a precompiled visual website with `index.html` at its root. Unzip and upload the extracted folder through Netlify Drop. On iPhone, extract in Files; folder upload may require a computer depending on the browser.

Open `/produktvisning/` on the deployed URL for the mobile app. It supports example save/dismiss/undo, filters, details, profile review, application editing/status/notes and example-text download. All data is clearly fictional and kept only in memory. The static bundle contains no backend, real signup, CV upload, live job search, payment or email delivery. `/hitta-jobb/` in this static package points to the labelled illustration. The native source route uses real jobs.

Rebuild the static bundle with `npm ci` and `npm run build:netlify-preview`; upload `.netlify-static/out`. The isolated export removes server routes, credentials and auth collection. Its home-screen manifest opens the illustration, while the native app manifest opens `/app`.

## Validation and remaining gates

Native and static builds and 28 tests pass. Real JobSearch, JobAd Links and taxonomy adapter smoke checks pass. Controlled browser preview was blocked, so rendered mobile/desktop, keyboard, axe and Lighthouse results remain unverified. No Netlify deployment has been made in your account.

Official references checked 19 September 2026:
- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://docs.netlify.com/deploy/create-deploys/
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
