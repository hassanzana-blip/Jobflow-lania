# Current delivery status

See [MOBILE-RELEASE.md](MOBILE-RELEASE.md) for the authoritative current implementation and verification record. The following original requirement inventory is retained for scope traceability; its original implementation-state column is superseded by the mobile release record.

# Original foundation inventory (superseded)

This is an initial implementation and design foundation, **not the finished JobbFlow product**. The original scope remains the acceptance target. “Code present” does not mean an integration is connected or verified.

## Requirement coverage

| Brief section | Current result | Remaining work |
|---|---|---|
| 1–2 Product / visual principles | Candidate control, restrained Swedish UI, no fabricated live activity | Validate comprehension with Swedish candidates |
| 3 Figma first | Editable five-page file; 39 variables, typography/effect styles; Button variants, JobCard, ApprovalCard; five initial flow frames | Full reusable component inventory, logo family, complete flows and all states |
| 4 Visual direction | Inter, neutral canvas, dark ink, teal accent, responsive CSS | Contrast inventory, mobile visual review, complete brand assets |
| 5 Technology | Next.js 16.3.5, TypeScript, Supabase/Redis/Stripe dependencies and server modules | Tailwind/shadcn decision, typed Drizzle schema, deployed services, email and analytics adapters |
| 6 Swedish job data | Official service audit; typed source and taxonomy boundaries | Retrieve official schemas, implement real normalization and contract tests; adapters currently throw explicit unavailable errors |
| 7 Search | Deterministic exact deduplication, conservative filtering, structural shortlist | Verified source ingestion, persistence, taxonomy retrieval and scheduled orchestration |
| 8 Candidate profile | Facts/preferences schemas and basic preference form | Secure PDF/DOCX upload, scanning/parsing, extraction confirmation and full editable profile |
| 9 Matching | Versioned weighted methodology; coverage, blockers and evidence checks with tests | Real job/candidate evaluation dataset, contextual factor calibration, persisted explanation UX |
| 10 Public website | Swedish responsive landing, illustrative product UI, four plans | Browser/mobile/accessibility/performance verification and conversion research |
| 11 Onboarding | Auth form/routes and initial Figma composition | Complete progressive onboarding, resumable confirmation and first real search |
| 12–13 Dashboard / detail | Initial editable Figma layouts and explicit product preview; authenticated empty shell | Live personalized cards, full detail page, save/dismiss persistence and errors |
| 14 Tailoring | Evidence-bound draft contract and Muse methods; unsupported number checks | Semantic truth validation, editable comparison, PDF/DOCX output and download |
| 15 Application agent | Permission interface, payload-bound approvals and disabled manual fallback | Permitted integrations, isolated Browser Use executor, server approval consumption and outcome reconciliation |
| 16 Tracker | Normalized tables and state transition rules | Functional mobile list, status editing, notes, reminders and documents |
| 17 Pricing | Four plan definitions, server quota SQL, checkout/portal/webhook routes | Quota settlement/release, period-transition policy, refund handling, concurrency and Stripe test-mode validation |
| 18 Daily hunt | Worker boundary; deliberately refuses unimplemented ingestion | Ingest persistence, scheduling, cancellation, deduplication and notifications |
| 19 Email | Resend dependency and notification tables | Branded templates, adapter, durable outbox, delivery/complaint handling |
| 20 Database | Initial relational migration, indexes, constraints and RLS | Apply migration; two-user isolation tests, query plans, typed ORM mapping and restoration drill |
| 21 Security/GDPR | Same-origin mutation checks, server-only secrets, private bucket migration, preliminary file validation, export route and deletion worker/outbox | Rate limiting, hardened CSP, SSR session refresh, safe parsers/scanner, signed downloads, complete retention/export/provider deletion, security and privacy review |
| 22–23 Muse / economics | Standard-only provider, structured schemas, bounded retries/tokens, metrics/cost calculation and confirmed-profile context | Live API verification, semantic failure metrics, shared safe caches, batching, token limits per plan and observability storage |
| 24–26 Mobile / accessibility / performance | Responsive semantic UI, focus/reduced-motion styling, authored viewport/axe checks, successful production build | Actual 320–430px browser runs, keyboard/screen-reader review, Figma comparison and Lighthouse/Core Web Vitals |
| 27 Analytics | Event/property sanitization with tests | Consent-controlled PostHog adapter, full event instrumentation, funnels and retention |
| 28 Admin | Explicit admin role table and audit schema | Restricted admin pages, server authorization and audited access |
| 29 Testing | 19 passing isolated core tests; authored public Playwright/axe tests | Live contract, database/RLS/quota/webhook integration tests and all critical E2E scenarios |
| 30 Design QA | Initial Figma screenshots inspected | Browser-to-Figma comparison blocked by local browser connectivity; no claim of visual parity |
| 31 Copy / localization | Central Swedish dictionary, locale boundary | Complete UI copy, remove remaining hardcoded labels, English/Norwegian dictionaries |
| 32 Reality rule | Missing sources fail explicitly; public examples labelled illustrative; submission disabled | Maintain this behavior throughout remaining integrations |
| 33 Environment | `.env.example`, ignored real secrets, flags off | Provision and verify service accounts and secrets |
| 34 Build order | Architecture and actual Figma preceded implementation | Continue the phases; none of the incomplete phases is waived |
| 35 Definition of done | Public proposition and local foundation available | End-to-end 17-step real candidate journey has not passed |

## Blockers and dependencies

1. JobSearch/JobAd Links/Taxonomy official schema downloads and live queries were unreachable in this environment. Source adapters remain deliberately unimplemented rather than guessing current field names.
2. No Supabase, Muse, Redis, Stripe, Resend or PostHog accounts/credentials were provided. No live service was provisioned or verified.
3. The controlled browser could not open the local Next server (`ERR_BLOCKED_BY_CLIENT`). Public Playwright/axe tests were authored but not run. No Lighthouse scores or mobile QA results are claimed.
4. No EU web/worker deployment target or domain is configured. Nothing was deployed to production.
5. Product functionality still needs substantial engineering and design work independent of those external blockers. Connecting keys alone will not finish the product.

## Known implementation gaps requiring priority review

- Current atomic quota reservation uses Stripe periods for paid accounts and UTC months for Free. Switching period anchors can change counted usage. Implement a documented transition ledger and concurrent integration tests before paid release; do not claim upgrades preserve usage yet.
- Export pages through owned database rows but does not produce a snapshot-consistent archive or include original document bytes. Large exports fail explicitly for background processing rather than silently truncate.
- Deletion removes object keys recorded in `documents`; orphaned uploads, caches, provider artifacts, backup expiry and retained audit/billing identifiers need a complete retention policy and verified cleanup.
- Generated text citing real facts can still make unsupported semantic claims. Numerical validation is one safeguard, not a truthfulness guarantee.
- SQL is not yet executed. Foreign-key cascade order, RLS behavior, storage ownership, Stripe reconciliation and worker idempotency require real integration testing.
- Authenticated saved/application screens are shells, not real trackers. Daily search throws `INGEST_PERSISTENCE_NOT_IMPLEMENTED` if source retrieval ever succeeds.

## Next executable sequence

Obtain official API schemas and EU service access → complete Figma components and flows → apply/test schema and auth isolation → secure document processing and profile confirmation → verified live ingestion/taxonomy → matching and application editing/export → billing transitions and tests → search/email workers → permitted browser assistance → full acceptance/security/accessibility/visual QA → deployment.
