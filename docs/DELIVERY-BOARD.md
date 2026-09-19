# Leveransetavle

Én linje per funksjon. Tilstanden er den strengeste som er *bevist*, ikke den
som er sannsynlig. «Koden finnes» er `implementert, ikke testet`.

| Tilstand | Betyr |
|---|---|
| `ikke implementert` | Ingen fungerende kode, eller koden kaster med vilje. |
| `implementert, ikke testet` | Kode finnes, men ingen test eller kjøring bekrefter oppførselen. |
| `testet lokalt` | Dekket av `npm test`, `npm run test:e2e` eller en manuell kjøring i dette miljøet. |
| `verifisert i produksjon` | Utført mot https://jobflowlaniashami.netlify.app med ekte tjenester. |
| `blokkert: <avhengighet>` | Kan ikke komme videre før den navngitte avhengigheten er på plass. |

**Oppdatert:** 19. september 2026.

## Sesjonsbegrensning som gjelder hele tavlen

Denne arbeidssesjonen har ingen utgående nettverkstilgang utenom npm-registeret,
og ingen tjenestehemmeligheter. `curl https://jobflowlaniashami.netlify.app/`
svarer `403 connect_rejected` fra utgangsproxyen, og verken Supabase, Netlify,
JobTech eller Meta Model API kan nås. Ingen linje på tavlen kan derfor settes
til `verifisert i produksjon` herfra. Alt som står som `blokkert: produksjons-
verifisering` er kode som er ferdig og lokalt testet, men som mangler den siste
kjøringen mot ekte tjenester.

## Etappe 1 — Konto ende-til-ende

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Databasetilkobling fra produksjon | `blokkert: nettverk/DATABASE_URL i denne sesjonen` | `src/server/db.ts` bruker pooler med `prepare:false`. Aldri bekreftet med en vellykket spørring. Første oppgave når tilgang finnes. |
| Migrering `jobbflow`-schema | `testet lokalt` | Kjøres i PGlite i `tests/database.test.ts`, inkl. RLS-isolasjon mellom to brukere. Ikke bekreftet mot Supabase-instansen. |
| Registrering (e-post + passord) | `implementert, ikke testet` | `src/app/api/auth/route.ts`. Krever 12 tegn og personvernsamtykke. |
| Bekreftelsesmail | `blokkert: verifisert avsenderdomene i Resend` | `onboarding@resend.dev` leverer bare til kontoeier. Se «Beslutninger jeg trenger». |
| Bekreftelseslenke på en annen enhet | `testet lokalt` | Byttet fra PKCE (`exchangeCodeForSession`) til `token_hash` + `verifyOtp`. Enhetstester i `tests/auth.test.ts`. Krever at e-postmalene i Supabase endres — se under. |
| E-postmaler peker på `token_hash` | `ikke implementert` | Må endres i Supabase-konsollen; ingen tilgang herfra. Eksakt tekst står i `docs/LIVE-SETUP.md`. |
| Feilside når en lenke ikke virker | `testet lokalt` | `/lankfel` med svensk forklaring per årsak (utgått / ugyldig / avbrutt / ufullstendig) i stedet for stille redirect. |
| Innlogging med passord | `testet lokalt` (svarlogikk) | Ugyldig innlogging, ubekreftet e-post og rate limiting er nå tre ulike svar med egne svenske meldinger. Selve Supabase-kallet er ikke kjørt. |
| Synlig feilmelding på mobil | `testet lokalt` | Meldingen ligger over knappen, `role="alert"`, `aria-live="assertive"`, `aria-invalid` på feltet, og rulles inn i synsfeltet. |
| Ingen lekkasje av om en e-postadresse finnes | `testet lokalt` | `isSilentAuthError` svarer likt for «sendt» og «finnes ikke» ved registrering, innloggingslenke og gjenoppretting. Test dekker ordlyden. |
| Innlogging med lenke | `implementert, ikke testet` | Samme callback-vei som bekreftelse. |
| Sesjon overlever refresh | `implementert, ikke testet` | SSR-cookies i `src/server/supabase.ts` og `src/proxy.ts`. |
| Utlogging | `implementert, ikke testet` | `src/app/api/auth/logout/route.ts`. |
| Glemt passord + nytt passord | `implementert, ikke testet` | `next=reset-password` bevart gjennom den nye callbacken. |
| Profil, preferanser, gratisabonnement ved registrering | `implementert, ikke testet` | Trigger `jobbflow.handle_new_user()`. Du har bekreftet fire rader for `jian@live.no`; ikke reprodusert her. |
| Beskyttede sider avviser uinnloggede | `implementert, ikke testet` | `requireUser()` krever `state='active'`. |
| To brukere ser ikke hverandres data | `testet lokalt` | RLS kjørt mot ekte PostgreSQL i PGlite. Gjenstår med to faktiske Supabase-kontoer. |
| Klikksporing avslått for transaksjonsmail | `ikke implementert` | Krever Resend-konsollen. Lenkeskanning kan brenne engangstokenet. |

## Etappe 2 — CV og bekreftet kandidatprofil

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Manuell profil i tre steg | `testet lokalt` | `ProfileWizard`, dekket av Playwright-flyten. |
| PDF/DOCX-opplasting | `ikke implementert` | `capabilities.cvUpload` er hardkodet `false` i `src/server/workspace.ts`. |
| Innholdskontroll av filer | `implementert, ikke testet` | `validateUpload` i `src/core/security.ts` sjekker magiske tall; ingen opplastingsvei bruker den ennå. |
| Privat lagring + signerte lenker | `ikke implementert` | Bucket `jobbflow-candidate-documents` finnes i migreringen. |
| Virusskanning / isolert parsing | `ikke implementert` | `CLAMAV_HOST` er tom i `.env.example`. |
| Strukturert uttrekk med kildesitat | `ikke implementert` | Kontrakten finnes (`CandidateSchema.facts[].sourceQuote`), uttrekket ikke. |
| Brukeren må bekrefte før bruk | `testet lokalt` | `confirmed`-flagget håndheves før utkast kan lages. |

## Etappe 3 — Ekte personlig jobbsøk

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Henting fra JobSearch og JobAd Links | `blokkert: nettverk i denne sesjonen` | `src/core/sources.ts`. Kontrakttester mot lagrede svar passerer. |
| Normalisering og deduplisering | `testet lokalt` | `deduplicate`, `canonicalUrl`, `possibleDuplicateKey`. |
| Deterministisk filtrering | `testet lokalt` | `filterJob`, utløpte og fjernede annonser lukes ut. |
| Kandidatvalg før AI | `testet lokalt` | `scoreFactors` gir strukturell kortliste; hele listen sendes ikke til modellen. |
| AI-analyse av de mest relevante | `blokkert: bekreftet Meta Model API-kall` | Se etappe 4. |
| `?q=` og filtre leses fra URL | `testet lokalt` | `src/core/search-params.ts`. `/hitta-jobb?q=utvecklare` kjører søket på serveren; klienten skriver tilbake med `router.replace`. |
| Kilde, sted, arbeidsform, datoer, originallenke | `testet lokalt` | Ukjente felter vises som «ej angiven», ikke gjettet. |
| Delvis kildefeil vises ærlig | `testet lokalt` | Teksten er nå «Svar saknas från en jobbkälla. Resultaten kan därför vara ofullständiga.» |

## Etappe 4 — AI som er sannferdig

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Utskiftbar `AIProvider` | `implementert, ikke testet` | `src/core/muse.ts`. |
| `muse-spark-1.3` på Meta Model API | `blokkert: nettverk i denne sesjonen` | Ingen vellykket kall er bekreftet. `-contributor`-varianten brukes ingen steder. |
| Schema-validering av svar | `testet lokalt` | Ugyldige modellsvar avvises i `tests/core.test.ts`. |
| Ingen oppdiktede fakta | `testet lokalt` | `validateDraft` avviser tall og påstander uten dekning i bekreftede fakta. |
| Latens- og kostnadslogg | `implementert, ikke testet` | `estimateCost`; ingen målinger finnes. |
| Tidsavbrudd og retry | `implementert, ikke testet` | Bundet retry i provideren. |
| Versjonering av brukerens redigeringer | `testet lokalt` | Ny immutabel dokumentversjon ved endring etter godkjenning. |

## Etappe 5 — Utfylling og godkjent innsending

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Nettleserassistanse | `ikke implementert` | `ENABLE_BROWSER_ASSISTANCE=false`, `BROWSER_USE_API_KEY` tom. |
| Godkjenning bundet til konkret versjon | `testet lokalt` | `payloadHash` + `verifyApproval`; endret innhold ugyldiggjør godkjenningen. |
| Hindring av dobbeltinnsending | `implementert, ikke testet` | Tilstandsovergangene i `canTransition`. |
| Valgt søknadssystem | `ikke implementert` | Ingen integrasjon valgt. Krever beslutning. |

## Etappe 6 — Design og mobilkvalitet

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Kontrast på `/kom-igang` | `testet lokalt` | Den ferdige patchen er brukt. |
| Lime brukt som tekstfarge ellers | `testet lokalt` | Gjennomgått: den andre `:root`-blokken i `globals.css` maler om `--color-accent` til `#bcf500` for hele appen, så *alle* `color: var(--color-accent)`-reglene var 1,28:1. Nytt token `--color-accent-ink` (`#324800`, 10:1) brukes nå der aksenten er tekst eller ikon. |
| Berøringsflater ≥ 24px | `testet lokalt` | Avkryssingsboks 24px, lenke i `auth-switch` polstret. |
| Bunnavigasjon dekker ikke innhold | `testet lokalt` | Safe-area-padding, dekket av breddekjøringene. |
| Ingen horisontal overflyt 320–430px | `testet lokalt` | Playwright kjører 320/360/375/390/393/430/1440. |
| axe WCAG 2.1 AA på offentlige sider | `testet lokalt` | Se «Testkjøringer» nederst. |
| WCAG 2.2 AA | `implementert, ikke testet` | 2.2-reglene kjøres av axe, men manuell tastatur- og skjermlesergjennomgang gjenstår. |
| Ingen oppdiktede tall eller anmeldelser | `testet lokalt` | Demodata er merket «Produktvisning». |

## Etappe 7 — Drift

| Funksjon | Tilstand | Merknad |
|---|---|---|
| `INGEST_PERSISTENCE_NOT_IMPLEMENTED` i workeren | `ikke implementert` | `workers/index.ts:92` kaster fortsatt. |
| Planlagte søk med kø og retry | `ikke implementert` | `REDIS_URL` er tom. |
| Ingen gjentatte varsler for samme jobb | `ikke implementert` | |
| Kvoter håndhevet på serveren | `testet lokalt` | Kvotetak og avvist plantukling dekket i `tests/database.test.ts`. |
| Stripe-rettigheter kun fra webhooks | `implementert, ikke testet` | `ENABLE_BILLING=false`; ingen testmoduskjøring gjort. |
| Dataeksport | `implementert, ikke testet` | Tar ikke med filinnhold ennå. |
| Kontosletting | `ikke implementert` | `ENABLE_ACCOUNT_DELETION=false` til utsendelse og slettedrill er kjørt. |

## Testkjøringer i denne sesjonen

- `npm run typecheck` — passerer.
- `npm test` — 36 tester passerer (28 fra før + 8 nye for auth-callback, feilklassifisering, API-feilkoder, URL-søketilstand og hemmelighets-redigering i livssjekken).
- `npm run build` — passerer.
- `npm run test:e2e` — **13 av 13 passerer i ekte Chromium.** Det er første gang denne pakken faktisk har kjørt; `docs/MOBILE-RELEASE.md` og `design-qa.md` har hittil stått som «authored, not run».

Tre funn fra den første virkelige kjøringen:

1. `next dev` hydrerer ikke i dette miljøet — HMR-socketen når ikke fram, sidene
   blir serverrendret men aldri interaktive, og hver klikk-test feilet stille.
   E2E kjører nå mot `next build && next start`, som også er det Netlify
   serverer. Dette forklarer hvorfor pakken aldri har kjørt før.
2. Hjelpetekst (`<small>`) lå inne i `<label>`-elementer som omsluttet
   kontrollen, så den ble en del av feltets *tilgjengelige navn*: statusfeltet
   het «Status Välj Skickad när du själv har lämnat in ansökan hos
   arbetsgivaren.» for en skjermleser. Hjelpeteksten er flyttet til
   `aria-describedby` for statusvelgeren, CV-fakta og rollefeltet. axe fanget
   ikke dette.
3. Playwrights `getByLabel` plukker opp innholdet i en `<textarea>` som en del
   av etiketten når etiketten omslutter feltet. Testene bruker nå rolle +
   tilgjengelig navn der det gjelder.

## Beslutninger jeg trenger fra deg

1. **Avsenderdomene for e-post.** `jafslarvik.no` ligger i Netlify DNS, men A-posten peker på Shopify (23.227.38.65). DNS-postene må legges der domenet faktisk styres. Velg: (a) eget subdomene for utsendelse, f.eks. `post.jafslarvik.no`, (b) et nytt domene kun for JobbFlow, eller (c) fortsett med `resend.dev` og godta at bare din egen adresse får mail. Uten dette kan ikke etappe 1 fullføres for ekte brukere.
2. **Endring av e-postmalene i Supabase** til `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=...`. Jeg har ingen tilgang til konsollen herfra.
3. **Avslå klikk- og åpningssporing** for transaksjonsmail i Resend.
4. **Hvilket søknadssystem** etappe 5 skal fullføres mot.
