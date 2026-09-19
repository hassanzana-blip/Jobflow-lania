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

Migreringen er kjørt mot produksjonsdatabasen og verifisert med spørring: alle
seks nye kolonner på `documents`, `document_extractions` med RLS på og én policy,
og `source_document_id` + `grounded` på `candidate_facts`. Additiv, `public` urørt.

Endepunktprober mot live: `GET /api/documents` og `GET /api/documents/url` svarer
begge 401 `UNAUTHENTICATED` med svensk tekst, og `POST /api/documents` fra fremmed
origin svarer 403 `INVALID_ORIGIN`.

Alt bak innlogging står som `blokkert: pålogget sesjon`. Opplasting, parse-tilstander,
409 på karantene, to-bruker-isolasjon og første modellkall krever at Jousef logger
inn én gang med en ekte fil. De er skrevet og lokalt testet, men ikke sett i drift.

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Manuell profil i tre steg | `testet lokalt` | `ProfileWizard`, dekket av Playwright-flyten. |
| PDF/DOCX-opplasting | `blokkert: pålogget sesjon` | `POST /api/documents`. `capabilities.cvUpload` er nå sann når service-nøkkel og Supabase-URL er satt, ellers viser UI-et ærlig at funksjonen ikke er tilkoblet. |
| Innholdskontroll av filer | `testet lokalt` | `validateUpload` sjekker magiske tall, MIME og endelse mot hverandre, og 10 MB-taket håndheves på bytes — ikke på `Content-Length`, som avsenderen kontrollerer. |
| Filnavn som ikke kan brukes som våpen | `testet lokalt` | Objektnøkkelen utledes (`<uid>/<uuid>.<ext>`); brukerens filnavn lagres bare som visningstekst, strippet for stier og kontrolltegn. |
| Privat lagring | `blokkert: pålogget sesjon` | Service-rollen laster opp til den private bucketen; feiler databasen, ryddes objektet bort så ingen fil blir eierløs. Krever ekte Supabase for å bekreftes. |
| Tidsbegrensede signerte lenker | `blokkert: pålogget sesjon` | `GET /api/documents/url`, 120 sekunder, eierskap sjekket i spørringen. Gis bare ut for `scan_state='clean'`. |
| Isolert parsing | `testet lokalt` | Egen prosess uten miljøvariabler (ingen service-nøkkel, ingen DATABASE_URL), 256 MB heap-tak, 20 s hard avbrudd, begrenset stdout. Ekte barneprosess kjøres i testene. |
| Virusskanning | `blokkert: CLAMAV_HOST` — arbeidsantakelse (b): behold 409, åpne aldri nedlasting for uskannede filer | clamd INSTREAM-klienten er skrevet og protokollen testet, men ingen daemon finnes. Uskannede dokumenter forblir `quarantined` og kan ikke lastes ned igjen — «skanner utilgjengelig» regnes aldri som «ren». |
| Krypterte og uleselige dokumenter | `blokkert: pålogget sesjon` (lokalt: `testet lokalt`) | Seks navngitte utfall (`ENCRYPTED`, `NO_TEXT_LAYER`, `CORRUPT`, `UNSAFE_ARCHIVE`, `TIMEOUT`, `PARSER_FAILED`), hver med sin svenske setning. En innskannet PDF uten tekstlag får beskjed om nettopp det. |
| DOCX-arkivforsvar | `testet lokalt` | Egen leser uten avhengighet: avviser krypterte poster, zip-bomber (både oppgitt ratio og faktisk utvidelse), stitraversering og alt annet enn `word/document.xml`. |
| Strukturert uttrekk med kildesitat | `testet lokalt` | `CandidateExtractionSchema` med sitat per faktum. |
| Usikkerhetsmarkering | `testet lokalt` | Usikkerhet **måles**, den spørres ikke modellen om: et faktum er «hittad i ditt dokument» bare når sitatet faktisk finnes i den opplastede teksten. Resten vises som osäkert og er ikke forhåndsvalgt. |
| Brukeren må korrigere og bekrefte | `testet lokalt` | Ingenting skrives til `candidate_facts` før bekreftelse. Redigerer brukeren et forslag, mister det sitatet sitt og lagres som brukerens egen påstand — `source_quote` blir null og `grounded` false. |
| CV-innhold som ubetrodd data | `testet lokalt` | Teksten går som `data` i providerens JSON-nyttelast, aldri som instruksjon; systemprompten sier det eksplisitt, og alle forslag verifiseres av kode etterpå uansett hva modellen påstår. |
| Gjenopptakelig gjennomgang | `blokkert: pålogget sesjon` | En ubekreftet `document_extractions`-rad hentes ved innlasting, så en refresh ikke mister arbeidet. Krever database for å bekreftes. |
| Dokumenttekst lagres ikke | `testet lokalt` | Bare sitatene som støtter et forslag lagres. Hele CV-teksten forlater aldri prosessen som leste den. |

## Etappe 3 — Ekte personlig jobbsøk

Hele rørledningen ligger nå i én ren funksjon, `planSearch` i `src/core/pipeline.ts`:
henting → deduplisering → deterministisk filtrering → rangering → budsjett.
«Modellen ser aldri en annonse kandidaten har utelukket» er dermed en testet
egenskap, ikke en intensjon.

| Funksjon | Tilstand | Merknad |
|---|---|---|
| Henting fra JobSearch og JobAd Links | `blokkert: nettverk i denne sesjonen` | `src/core/sources.ts`. Kontrakttester mot lagrede svar passerer. Du bekreftet 60 treff i produksjon i etappe 1. |
| Normalisering og deduplisering | `testet lokalt` | Samme annonse fra begge kilder blir ett jobb; sporingsparametre bryter ikke sammenslåingen. |
| Deterministisk filtrering | `testet lokalt` | Utelukket tittel, utelukket arbeidsgiver, fjernet og utløpt annonse lukes ut før noe koster penger. Hver avvisning har en grunn. |
| Kandidatvalg før AI | `testet lokalt` | `shortlist` rangerer på yrkesgruppe, rolleoverlapp og ferskhet. Taket er 6 annonser per søk — Free har 25 djupanalyser i måneden, så et høyere tall ville brent en tredjedel på ett klikk. |
| Ikke send alle annonser til modellen | `testet lokalt` | Testet direkte: 40 hentede annonser gir 6 analyser, og en avvist annonse når aldri providern. |
| AI-analyse av de mest relevante | `blokkert: bekreftet Meta Model API-kall` | Koden kaller `scoreJob` for kortlisten, lagrer `job_matches` + `match_factors`, og reserverer kvote per jobb. Aldri kjørt mot ekte API. |
| Poengsummen regnes av kode, ikke av modellen | `testet lokalt` | Dette var en reell feil: `scoreJob` kjørte `scoreFactors` for validering og kastet resultatet. Nå returneres den vektede summen, og modellen leverer bare faktorer og bevis. |
| Et faktum modellen finner på stopper analysen | `testet lokalt` | Et bevis-ID som ikke finnes blant bekreftede fakta gir feil på det jobbet; resten av søket berøres ikke. |
| Kvote brennes ikke på nytt ved refresh | `testet lokalt` | Reservasjons-ID utledes av bruker + jobb + profilversjon, og `reserve_usage` er idempotent på den. Ny bekreftet profilversjon er en ny analyse og koster på nytt. |
| Feilet analyse koster ingenting | `implementert, ikke testet` | Reservasjonen slippes når kallet ikke fører til en lagret match. Krever database for å bekreftes. |
| Analyse overlever refresh | `implementert, ikke testet` | `loadWorkspace` henter score, sammendrag, grunner og mangler for gjeldende profilversjon. En ny profilversjon lar ikke gamle poeng stå som om de var aktuelle. |
| `?q=` og filtre leses fra URL | `verifisert i produksjon` | Bekreftet av Jousef. |
| Kilde, sted, arbeidsform, datoer, originallenke | `testet lokalt` | Ukjente felter vises som «ej angiven», ikke gjettet. |
| Delvis kildefeil vises ærlig | `testet lokalt` | «Svar saknas från en jobbkälla. Resultaten kan därför vara ofullständiga.» |
| Hvor mye som faktisk ble analysert vises | `testet lokalt` | «6 av 42 djupanalyserade.» En score på seks av førti er ikke en rangert liste over førti, og det står det. Tom kvote og ubekreftet profil får hver sin setning. |
| CI som vokter en PR | `testet lokalt` | `.github/workflows/ci.yml` kjører typecheck, `npm test` og Playwright på hver PR. Til nå voktet bare Netlify-bygget, som sier ingenting om at appen virker. |

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
- `npm test` — 58 tester passerer (49 fra før + 9 nye for rørledningen og for at
  poengsummen regnes av kode).
- `npm run build` — passerer.
- `npm run test:e2e` — 13 av 13 passerer i ekte Chromium.
- `npm audit` — 0 sårbarheter.

## Hva jeg trenger at du verifiserer i produksjon

Punkt 1 gjelder før merge. Resten krever én pålogget sesjon — det er den samme
sperren som stoppet etappe 2, og den flytter seg ikke før noen logger inn med en
ekte fil.

1. **Migreringen.** Kjør `supabase/migrations/20260919180000_match_gaps_and_analysis_counts.sql`.
   Additiv: `gaps` på `job_matches`, `analysed` og `analysis_skipped` på `search_runs`.
2. **CI.** Workflowen vokter først PR-er etter at den ligger på `main`. Sjekk at
   den blir grønn på neste PR, og at den faktisk kjører Playwright og ikke bare bygger.
3. **Et søk med bekreftet profil og modellnøkkel.** Forvent: høyst 6 jobb med
   score, linjen «6 av N djupanalyserade», og `jobbflow.job_matches` med
   `method_version='evidence-v1'` for nettopp de seks. Resten skal ha
   `retrieval-v1` og ingen score.
4. **Kvote.** Kjør samme søk to ganger. `jobbflow.usage_events` skal ikke vokse
   andre gang — reservasjons-ID-en er den samme. Bekreft deretter en ny
   profilversjon og søk igjen: nå *skal* den vokse.
5. **Refresh.** Last siden på nytt og bekreft at scorene fortsatt vises, med
   grunner og mangler.
6. **Delvis kildefeil.** Hvis du kan få én kilde til å feile, bekreft at
   resultatene fra den andre vises sammen med «Svar saknas från en jobbkälla».
7. **Kostnad og latens.** Les `jobbflow.model_usage` etter søket. Dette er
   fortsatt første gang modellen kalles i produksjon — hvis latensen gjør et søk
   ubehagelig tregt, si fra, så flytter jeg analysen til en kø i etappe 7 i
   stedet for å gjøre den synkront.
8. Punkt 2 til 8 fra forrige runde står fortsatt åpne (opplasting, parse-tilstander,
   409 på karantene, to-bruker-isolasjon).

## Beslutninger jeg trenger fra deg

## Beslutninger jeg trenger fra deg

1. **Avsenderdomene for e-post.** `jafslarvik.no` ligger i Netlify DNS, men A-posten peker på Shopify (23.227.38.65). DNS-postene må legges der domenet faktisk styres. Velg: (a) eget subdomene for utsendelse, f.eks. `post.jafslarvik.no`, (b) et nytt domene kun for JobbFlow, eller (c) fortsett med `resend.dev` og godta at bare din egen adresse får mail. Dette blokkerer både ekte bekreftelsesmail og avslåing av klikksporing, siden den innstillingen er per domene.
2. **Virusskanner eller ikke.** Uten `CLAMAV_HOST` forblir hvert opplastet dokument
   `quarantined` og kan ikke lastes ned igjen. Koden er skrevet og protokollen testet.
   Velg: (a) kjør clamd et sted appen når, (b) godta at brukeren ikke kan hente sitt
   eget dokument tilbake inntil videre, eller (c) la meg åpne nedlasting for
   uskannede filer — det siste anbefaler jeg ikke, og gjør ikke uten at du sier det.
3. **Hvilket søknadssystem** etappe 5 skal fullføres mot.
