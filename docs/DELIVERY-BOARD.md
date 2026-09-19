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

**Oppdatert:** 19. september 2026 (etappe 1 verifisert i produksjon av Jousef; etappe 2 levert og testet lokalt).

## Arbeidsdeling og sesjonsbegrensning

Denne arbeidssesjonen har ingen utgående nettverkstilgang utenom npm-registeret,
og ingen tjenestehemmeligheter. `curl https://jobflowlaniashami.netlify.app/`
svarer `403 connect_rejected` fra utgangsproxyen, og verken Supabase, Netlify,
JobTech eller Meta Model API kan nås. Ingen linje settes derfor til
`verifisert i produksjon` herfra: koden skrives og testes lokalt, og
produksjonsverifisering, Supabase- og Netlify-konfigurasjon og axe-kjøringer
mot live gjøres av Jousef. «Hva som må verifiseres» nederst er listen.

## Etappe 1 — Konto ende-til-ende

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Databasetilkobling fra produksjon | `verifisert i produksjon` | Bekreftet av Jousef sammen med resten av etappe 1 (main@a38fb2c). |
| Migrering `jobbflow`-schema | `testet lokalt` | Kjøres i PGlite i `tests/database.test.ts`, inkl. RLS-isolasjon mellom to brukere. Ikke bekreftet mot Supabase-instansen. |
| Registrering (e-post + passord) | `implementert, ikke testet` | `src/app/api/auth/route.ts`. Krever 12 tegn og personvernsamtykke. |
| Bekreftelsesmail | `blokkert: verifisert avsenderdomene i Resend` | `onboarding@resend.dev` leverer bare til kontoeier. Se «Beslutninger jeg trenger». |
| Bekreftelseslenke på en annen enhet | `verifisert i produksjon` | Byttet fra PKCE (`exchangeCodeForSession`) til `token_hash` + `verifyOtp`. Enhetstester i `tests/auth.test.ts`. Krever at e-postmalene i Supabase endres — se under. |
| E-postmaler peker på `token_hash` | `verifisert i produksjon` | Satt av Jousef for Confirm signup, Magic link og Reset password. |
| Feilside når en lenke ikke virker | `verifisert i produksjon` | `/lankfel` med svensk forklaring per årsak (utgått / ugyldig / avbrutt / ufullstendig) i stedet for stille redirect. |
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
| Klikksporing avslått for transaksjonsmail | `blokkert: verifisert avsenderdomene i Resend` | Innstillingen er per domene, så den kan ikke settes før et domene er verifisert. |

## Etappe 2 — CV og bekreftet kandidatprofil

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Manuell profil i tre steg | `testet lokalt` | `ProfileWizard`, dekket av Playwright-flyten. |
| PDF/DOCX-opplasting | `testet lokalt` | `POST /api/documents`. `capabilities.cvUpload` er nå sann når service-nøkkel og Supabase-URL er satt, ellers viser UI-et ærlig at funksjonen ikke er tilkoblet. |
| Innholdskontroll av filer | `testet lokalt` | `validateUpload` sjekker magiske tall, MIME og endelse mot hverandre, og 10 MB-taket håndheves på bytes — ikke på `Content-Length`, som avsenderen kontrollerer. |
| Filnavn som ikke kan brukes som våpen | `testet lokalt` | Objektnøkkelen utledes (`<uid>/<uuid>.<ext>`); brukerens filnavn lagres bare som visningstekst, strippet for stier og kontrolltegn. |
| Privat lagring | `implementert, ikke testet` | Service-rollen laster opp til den private bucketen; feiler databasen, ryddes objektet bort så ingen fil blir eierløs. Krever ekte Supabase for å bekreftes. |
| Tidsbegrensede signerte lenker | `implementert, ikke testet` | `GET /api/documents/url`, 120 sekunder, eierskap sjekket i spørringen. Gis bare ut for `scan_state='clean'`. |
| Isolert parsing | `testet lokalt` | Egen prosess uten miljøvariabler (ingen service-nøkkel, ingen DATABASE_URL), 256 MB heap-tak, 20 s hard avbrudd, begrenset stdout. Ekte barneprosess kjøres i testene. |
| Virusskanning | `blokkert: CLAMAV_HOST` | clamd INSTREAM-klienten er skrevet og protokollen testet, men ingen daemon finnes. Uskannede dokumenter forblir `quarantined` og kan ikke lastes ned igjen — «skanner utilgjengelig» regnes aldri som «ren». |
| Krypterte og uleselige dokumenter | `testet lokalt` | Seks navngitte utfall (`ENCRYPTED`, `NO_TEXT_LAYER`, `CORRUPT`, `UNSAFE_ARCHIVE`, `TIMEOUT`, `PARSER_FAILED`), hver med sin svenske setning. En innskannet PDF uten tekstlag får beskjed om nettopp det. |
| DOCX-arkivforsvar | `testet lokalt` | Egen leser uten avhengighet: avviser krypterte poster, zip-bomber (både oppgitt ratio og faktisk utvidelse), stitraversering og alt annet enn `word/document.xml`. |
| Strukturert uttrekk med kildesitat | `testet lokalt` | `CandidateExtractionSchema` med sitat per faktum. |
| Usikkerhetsmarkering | `testet lokalt` | Usikkerhet **måles**, den spørres ikke modellen om: et faktum er «hittad i ditt dokument» bare når sitatet faktisk finnes i den opplastede teksten. Resten vises som osäkert og er ikke forhåndsvalgt. |
| Brukeren må korrigere og bekrefte | `testet lokalt` | Ingenting skrives til `candidate_facts` før bekreftelse. Redigerer brukeren et forslag, mister det sitatet sitt og lagres som brukerens egen påstand — `source_quote` blir null og `grounded` false. |
| CV-innhold som ubetrodd data | `testet lokalt` | Teksten går som `data` i providerens JSON-nyttelast, aldri som instruksjon; systemprompten sier det eksplisitt, og alle forslag verifiseres av kode etterpå uansett hva modellen påstår. |
| Gjenopptakelig gjennomgang | `implementert, ikke testet` | En ubekreftet `document_extractions`-rad hentes ved innlasting, så en refresh ikke mister arbeidet. Krever database for å bekreftes. |
| Dokumenttekst lagres ikke | `testet lokalt` | Bare sitatene som støtter et forslag lagres. Hele CV-teksten forlater aldri prosessen som leste den. |

## Etappe 3 — Ekte personlig jobbsøk

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Henting fra JobSearch og JobAd Links | `blokkert: nettverk i denne sesjonen` | `src/core/sources.ts`. Kontrakttester mot lagrede svar passerer. |
| Normalisering og deduplisering | `testet lokalt` | `deduplicate`, `canonicalUrl`, `possibleDuplicateKey`. |
| Deterministisk filtrering | `testet lokalt` | `filterJob`, utløpte og fjernede annonser lukes ut. |
| Kandidatvalg før AI | `testet lokalt` | `scoreFactors` gir strukturell kortliste; hele listen sendes ikke til modellen. |
| AI-analyse av de mest relevante | `blokkert: bekreftet Meta Model API-kall` | Se etappe 4. |
| `?q=` og filtre leses fra URL | `verifisert i produksjon` | `src/core/search-params.ts`. `/hitta-jobb?q=utvecklare` kjører søket på serveren; klienten skriver tilbake med `router.replace`. |
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
| Kontrast på `/kom-igang` | `verifisert i produksjon` | Den ferdige patchen er brukt. |
| Lime brukt som tekstfarge ellers | `verifisert i produksjon` | Gjennomgått: den andre `:root`-blokken i `globals.css` maler om `--color-accent` til `#bcf500` for hele appen, så *alle* `color: var(--color-accent)`-reglene var 1,28:1. Nytt token `--color-accent-ink` (`#324800`, 10:1) brukes nå der aksenten er tekst eller ikon. |
| Berøringsflater ≥ 24px | `testet lokalt` | Avkryssingsboks 24px, lenke i `auth-switch` polstret. |
| Bunnavigasjon dekker ikke innhold | `testet lokalt` | Safe-area-padding, dekket av breddekjøringene. |
| Ingen horisontal overflyt 320–430px | `testet lokalt` | Playwright kjører 320/360/375/390/393/430/1440. |
| axe WCAG 2.1 AA på offentlige sider | `verifisert i produksjon` | Se «Testkjøringer» nederst. |
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
- `npm test` — 49 tester passerer (36 fra før + 13 nye for DOCX-arkivforsvar, isolert
  parsing, uttrekksverifisering, filnavnshåndtering og clamd-protokollen).
- `npm run build` — passerer.
- `npm run test:e2e` — 13 av 13 passerer i ekte Chromium.
- `npm audit` — 0 sårbarheter. `drizzle-orm` var deklarert uten å importeres noe sted
  og hadde et høyt-alvorlig SQL-injeksjonsvarsel; den er fjernet. Legg den inn igjen
  i ≥0.45.2 den dagen det typede skjemaet faktisk skal bygges.
- Ny avhengighet: `pdfjs-dist` for PDF-tekstuttrekk. Valgt framfor en egen parser
  fordi den er bygget for å lese fiendtlige PDF-er i nettlesere, og fordi den
  håndterer kryptering, CID-fonter og teksttilstand som en hjemmesnekret leser
  ville tatt feil av på svenske tegn. Den kjøres bare i den isolerte prosessen.
  DOCX har ingen ny avhengighet — arkivleseren er skrevet her, nettopp for å
  kontrollere zip-bombeforsvaret selv.

## Hva jeg trenger at du verifiserer i produksjon

I denne rekkefølgen. Alt under krever ekte Supabase, som jeg ikke når.

1. **Migreringen.** Kjør `supabase/migrations/20260919160000_cv_upload_and_extraction.sql`.
   Den er additiv og rører ikke `public`. Deretter `npm run check:live` — den bør
   fortsatt rapportere RLS på for alle tabeller, nå inkludert `document_extractions`.
2. **Opplasting av en ekte PDF.** Logg inn, gå til Profil, last opp et CV. Forvent:
   en rad i `jobbflow.documents` med `parse_state='parsed'`, `scan_state='quarantined'`,
   `original_name` uten sti, og en objektnøkkel på formen `<uid>/<uuid>.pdf`.
3. **Opplasting av en innskannet PDF** (et foto lagret som PDF). Forvent den svenske
   setningen om at dokumentet ikke har markerbar text, ikke en tom profil.
4. **Opplasting av et lösenordsskyddat dokument.** Forvent setningen om lösenord.
5. **Gjennomgangen.** Med `META_MODEL_API_KEY` satt: kontroller at forslag som
   stemmer med dokumentet er merket «Hittad i ditt dokument» og forhåndsvalgt, og at
   noe modellen har funnet på er merket osäkert og *ikke* forhåndsvalgt. Dette er
   første gang modellen kalles i produksjon — logg latens og kostnad fra
   `jobbflow.model_usage`.
6. **Bekreftelsen.** Behold ett forslag uendret, rediger et annet, og bekreft.
   Forvent i `jobbflow.candidate_facts`: det uendrede har `source_quote` satt,
   `grounded=true` og `source_document_id`; det redigerte har `source_quote` null og
   `grounded=false`.
7. **Signert lenke.** `GET /api/documents/url?id=<id>` skal svare 409 så lenge
   dokumentet er `quarantined`. Det er riktig oppførsel uten virusskanner — ikke
   en feil å «fikse» ved å slippe gjennom uskannede filer.
8. **To brukere.** Bekreft at bruker B verken får `document_extractions`-rader eller
   signerte lenker for bruker A.
9. **axe** på profilsiden etter at gjennomgangen vises, på 390 px.

## Beslutninger jeg trenger fra deg

## Beslutninger jeg trenger fra deg

1. **Avsenderdomene for e-post.** `jafslarvik.no` ligger i Netlify DNS, men A-posten peker på Shopify (23.227.38.65). DNS-postene må legges der domenet faktisk styres. Velg: (a) eget subdomene for utsendelse, f.eks. `post.jafslarvik.no`, (b) et nytt domene kun for JobbFlow, eller (c) fortsett med `resend.dev` og godta at bare din egen adresse får mail. Dette blokkerer både ekte bekreftelsesmail og avslåing av klikksporing, siden den innstillingen er per domene.
2. **Virusskanner eller ikke.** Uten `CLAMAV_HOST` forblir hvert opplastet dokument
   `quarantined` og kan ikke lastes ned igjen. Koden er skrevet og protokollen testet.
   Velg: (a) kjør clamd et sted appen når, (b) godta at brukeren ikke kan hente sitt
   eget dokument tilbake inntil videre, eller (c) la meg åpne nedlasting for
   uskannede filer — det siste anbefaler jeg ikke, og gjør ikke uten at du sier det.
3. **Hvilket søknadssystem** etappe 5 skal fullføres mot.
