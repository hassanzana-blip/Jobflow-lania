> Current deployment status: see [LIVE-SETUP.md](docs/LIVE-SETUP.md). JobbFlow now uses the isolated `jobbflow` schema; historical public-schema migrations must not be deployed.

# JobbFlow

Swedish job discovery and candidate-controlled application preparation, built with Next.js 16, React and TypeScript.

**Under development. Not ready for production launch.** See `docs/MOBILE-RELEASE.md` for exactly what works, what was tested, and what remains.

Editable design: https://www.figma.com/design/KFTJVhbRq9phUGbFjPeud8?node-id=30-11

## Run

Node 24:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

- `/` — public Swedish landing and pricing.
- `/hitta-jobb` — real public JobSearch and JobAd Links search, no account needed. The query and work-style filter live in the URL (`?q=…&arbetsform=…`), so a result list can be shared and reloaded.
- `/produktvisning` — interactive mobile product example, clearly fictional. No real applications or accounts; changes live only in memory.
- `/kom-igang` and `/logga-in` — real Supabase Auth when configured.
- `/app` — authenticated mobile workspace with database-backed profile, saved jobs and application tracker. A search retrieves, deduplicates, filters against the candidate's own requirements and ranks what survives; only the top few reach the model, and the interface says how many of the results were actually analysed. A CV can be uploaded as PDF or DOCX; it is stored privately, parsed in a separate process with no credentials, and every fact proposed from it is marked with whether its quote was actually found in the document. Nothing becomes profile data until the candidate confirms it.

`npm test` runs 58 core, contract, auth, document, pipeline, PDF and PostgreSQL migration tests. `npm run build` builds the native web app. `npm run test:e2e` runs 13 Playwright/axe checks; it builds and starts a production server first, because `next dev` does not hydrate in sandboxed runners and every interaction then silently does nothing. `npm run check:live` verifies that a deployment's own `DATABASE_URL` actually connects, that the migration is applied and that RLS is on — it prints variable names, hosts and counts, never a secret.

## Netlify

Use `JobbFlow-Source-v2.zip` as the complete source. Connect a repository containing its contents to Netlify; `netlify.toml` already defines the Next.js build. This is the path for real server functionality. Configure secrets in Netlify and apply `supabase/migrations/0001_core.sql`, `0002_workspace.sql`, then `0003_generation_leases.sql` to your Supabase project. Add the site's `/auth/callback` URL to Supabase Auth redirects.

`JobbFlow-Netlify.zip` is a separately compiled **visual preview** for Netlify Drop. It has the interactive example but no backend, live search, accounts, uploads or payments. Unzip before uploading. Do not confuse the visual preview with the full app.

See `docs/NETLIFY.md` for setup. Persistent Redis/BullMQ workers need a separate process/runtime.

## Boundaries

No service credentials were provided or provisioned. The UI reports missing services honestly. No live deployment in your Netlify account has occurred. CV processing, continuous searches, alerts, complete billing and other original requirements still need implementation and acceptance testing; keys alone will not finish the product.

Private APIs validate identity on the server. Database migrations include RLS and private storage. Generated text requires candidate review; PDF download requires a reviewed version. Application status is candidate-managed and does not imply automatic submission. Browser assistance remains disabled.

Schemas and live API samples: `docs/contracts`. Mobile copy: `src/i18n/mobile-sv.ts`. Matching methodology and target architecture: `docs/ARCHITECTURE.md`. Current design QA limitations: `design-qa.md`.
