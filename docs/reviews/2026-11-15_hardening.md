# FINN hardening: close the loopholes found by the drift report (v2)

Status: revised after the EGM review (`docs/reviews/hardening-review/consolidated_review_report.md`).
Owner decisions taken 15 Nov 2026: bull vs bear stays **live** with a minimal guard; **no CI** (decided during step 2, reversing the earlier yes).
No open decisions remain. Nothing here is built yet.

## Context
FINN is a mobile-first web app for an equity investor. It reads NSE filings and results for a portfolio
and shows: **Today** (a daily brief of filings ranked "needs you" / "worth a read" / folded), **Portfolio**
(per-company status of tracked claims), **Company** (management's promises and whether they were met,
quarterly numbers, and a model-written **bull vs bear** — a few cited sentences for and against),
**Ask** (any NSE ticker, and "who in my network knows X"), and **Settings** (alert thresholds).
Data: offline Python workers (`workers/`) publish a static JSON snapshot (`web/data/*.json`) that the
Next.js app (`web/`) bundles; Supabase holds only per-user rows (contacts, thresholds, edited
assumptions) under row-level security (RLS) for anonymous sessions. A model (Gemini) is used in two
places: offline promise extraction (`workers/llm.py`) and live bull vs bear (`web/app/api/bull-bear`).
The investor's contact network must never reach a model; both paths refuse payloads containing contact
field names ("network fields": `display_name`, `closeness`, `contact_stints`, …).
EGM (Elephant-Goldfish Model) is the review method used: an author drafts, fresh-context reviewers check.

## 1. Problem
After the redesign and nine fixes (commits `ef3ad83`…`076f8ab`), the drift report found:
1. **False statements** in README.md and WRITEUP-draft.md: "a model is used in exactly one place",
   "bull vs bear is not built", "assumption editor cut", 34 tests (there are 40), Today "opens on 6 Nov"
   (it opens on 15 Nov), setup that omits migration 0002 and the Vercel model key.
2. **Loopholes** — a caller can exhaust the project's model quota; a model-written number can reach
   the screen unchecked; one input shows different values on different screens; the parser can produce
   wrong numbers instead of refusing.
3. **Prototype shortcuts** that design-v2.md describes as built (Postgres as the source of truth,
   per-user scores, route handlers per screen, Playwright, service worker). These are documented as not
   built; this pass builds none of them (CI was considered and declined by the owner).

## 2. Goals (each with its check)
- G1 (L1) README.md and WRITEUP-draft.md: every number, count, date, command, file path and feature
  claim matches the final commit. *Check:* re-run the README/writeup drift reviewer; zero Blocker/Major.
- G2 (L2) Total bull-vs-bear model calls are bounded by a global daily cap regardless of caller.
  *Check:* with the cap set to 1, a second cold generation the same day returns the "limit reached" message.
- G3 (L3) Every ₹ amount, percentage and bps figure in a bull-vs-bear sentence appears in that
  sentence's cited evidence; sentences that fail are dropped and counted. *Check:* validator unit tests.
- G4 (L5) An assumption edit changes the status pill and bullet chart on Today, Portfolio and Company.
  Ranking stays as computed offline. *Check:* pure-function test + manual check on the deployed app.
- G5 (L8) The parser refuses a fact it reads whose unit is not INR, and Ask says "results in an
  unsupported format". *Check:* parser tests incl. the real M&M fixture unchanged.
- G6 (L12) Withdrawn: no CI by owner decision. Tests stay manual; the README says how to run them.

Non-goals (documented in the README as not built, with reasons): Postgres as the app's read path and
per-user `event_scores`; promise extraction for unseen tickers; Playwright end-to-end tests; service
worker; custom time window; Portfolio sort; statistical thresholds; expertise map; WhatsApp share;
named-slot number generation; on-device re-ranking; per-day bundle split.

## 3. Findings acted on (re-checked)
| # | Finding | Evidence | Sev. |
|---|---|---|---|
| L1a | README/writeup claim one model use and no bull vs bear | README §4 l.86-87, §9 l.181; WRITEUP l.43-44, 63 | Blocker |
| L1b | Counts, dates, setup, spend, Settings out of date | README §1, §3, §6, §7, §10, §11; WRITEUP l.28, 37, 55-56 | Major |
| L2 | `POST /api/bull-bear`: no cache, no cap — anyone can exhaust the quota | `web/app/api/bull-bear/route.ts` | Blocker |
| L3 | Bull-vs-bear numbers never checked against evidence | `web/lib/bullbear.ts:88-95` | Blocker |
| L4 | No "FINN's read" label; Stop missing; TS model path unlogged | `web/components/company/BullBear.tsx` | Major |
| L5 | Assumption edit changes only the Company page; editor not URL state; `editable:false` | `web/components/company/InvestorAssumption.tsx`, `web/lib/companies.ts:87` | Major |
| L6 | Reset demo leaves thresholds and assumptions | `web/components/settings/ResetDemo.tsx:15-18` | Major |
| L7 | Price shown as whole rupees (₹169.20 → ₹169) | `web/lib/companies.ts:79` | Major |
| L8 | Parser never checks units; EBITDA fallback includes exceptional items; unseen-ticker parse errors swallowed | `workers/parsers/xbrl_results.py`, `py/xbrl_results.py`, `py/main.py:111,147` | Major |
| L9 | `promises.status` constraint and default use the old vocabulary | `db/migrations/0001_init.sql:59-60` | Major |
| L10 | Hard-coded dates disagree (Python 15 Nov vs app 14 Nov boundary) | `workers/thesis.py:22`, `web/lib/copy.ts` Settings line | Nit |
| L11 | `/status` (setup smoke page) and `/dev/cards` routable in production | `web/app/status`, `web/app/(tabs)/dev/cards` | Nit |
| L12 | No CI | no `.github/` | Withdrawn (owner: no CI) |
| L13 | Today's client JS size unmeasured | `web/components/today/TodayView.tsx` → `web/lib/api.ts` | Nit (measure only) |
| L14 | Card company name not a link; "Who knows" results can't open a call sheet | `web/components/today/EventCard.tsx:31`, `web/components/ask/AskView.tsx:212-218` | Nit (UX) |

## 4. Design
### 4.1 Bull vs bear, live with a minimal guard (L2-L4)
- **Persistent shared cache** in Supabase table `bull_bear_cache(symbol, evidence_sha, payload jsonb,
  status, created_at)`, primary key `(symbol, evidence_sha)`. The evidence (last 4 quarters + ledger
  quotes from the snapshot) fixes the prompt; one validated result per evidence hash is served to every
  visitor. Model output is not deterministic; caching is what makes all visitors see the same text.
- **Server-only access.** RLS on, no policies; the route uses a service-role key
  (`SUPABASE_SERVICE_ROLE_KEY`, a new Vercel secret, never sent to the browser) through a server-only
  client in `web/lib/supabaseServer.ts`.
- **Global daily cap** (`BULL_BEAR_DAILY_CAP`, default 40 generations ≈ all ~22 companies once with
  room for refreshes; each generation is up to 12 upstream requests: 2 sides × 2 models × 3 attempts).
  Counted in `bull_bear_daily(day, n)` with an atomic `insert … on conflict do update set n = n + 1
  returning n`. Cache hits are free. No per-user limit: anonymous sessions are self-minted.
- **Single flight.** Before generating, the route inserts a `status='generating'` row (on conflict do
  nothing); if one exists and is under 3 minutes old, it replies "being written, try again in a minute".
- **Flow.** Cache hit → replay as NDJSON (Bear, then Bull) immediately. Miss → cap → single-flight →
  generate → validate → store `status='ready'` → stream. Only complete, validated results are stored.
  **Refresh** is offered when the cached copy is over 24 hours old; it counts against the cap.
- **Stop** detaches the client; the server finishes and caches, so the work is not wasted.
- **Number validator** (alias-free `web/lib/numcheck.ts`): extract ₹ amounts, percentages and bps
  (accepting Indian grouping, "cr"/"crore", the Unicode minus); ignore four-digit years, `Q1`-`Q4`,
  `FY\d\d`; a figure passes if equal, after rounding both to the decimals shown in the sentence, to a
  figure in a cited evidence item of the same kind. Failing sentences are dropped and counted; the prompt
  asks for digits, not spelled-out numbers.
- **Label and logging.** Each side carries "FINN's read" (`EpistemicTag e="INFERRED"`). Each live call
  writes an `llm_calls` row (existing table) with model, tokens from `usageMetadata`, cache hit.
  The per-device localStorage copy is removed; the server cache is the source of truth.

### 4.2 One assumption on every screen (L5)
`web/lib/assumption.ts` gains the `settings.ts` store pattern (`loadAssumptions`, `onAssumptions`,
notify on save, `resetAssumptions`). `build_digest.py` adds compact quarter inputs (period, revenue,
EBITDA margin; last 8 quarters) per symbol with an investor assumption to `digest.json`; Portfolio rows
receive the same through server props. A pure `applyOverride(claim, input, quarters, dataTo)` rebuilds
the claim; Today cards (investor items only) and Portfolio rows use it. Ranking and the card's selected
item stay as computed offline; when an edit changes a card's status, its reason line reads "your edited
assumption: <status>". Investor items become `editable: true`. The editor moves into the URL
(`?sheet=assumption`) and is opened only from the Company page, which supplies its data.

### 4.3 Correctness (L6-L10)
- Reset demo deletes the user's `user_settings` and `user_assumptions` rows (`.eq("user_id", uid)`),
  then resets the in-memory stores; localStorage keys are left (they are per-device conveniences).
- New `NumValue` kind `inr` (₹, Indian grouping, two decimals) for prices, `epistemic: "EXTRACTED"`
  with the price source, at `companies.ts`, the Company page and Ask.
- Parser: for facts it reads (`ELEMENTS` and associates), require `unitRef` → `iso4217:INR`, else raise
  `UnsupportedUnits`; `decimals` is precision and ignored. EBITDA when the before-exceptional line is
  missing: use PBT if exceptional items are absent or zero; otherwise derive the sign by reconciliation
  (PBE ± exceptional = PBT, as associates are) and refuse EBITDA for that quarter if neither reconciles.
  Fixtures for each; a test asserts the two parser copies are identical below their headers.
  `py/main.py` reports `UnsupportedUnits` as a step detail; Ask shows "results in an unsupported format".
- `db/migrations/0003_promise_status.sql`: re-runnable; drops and re-adds the constraint with
  `on_track, behind, met, missed, cant_check` and sets the default to `cant_check`. The table is empty.
- Dates: `workers/thesis.py` takes the snapshot date from the latest filing in `seed/filings/recent.json`
  and judges met/missed against that day (14 Nov), as the app does; the Settings line receives the date.

### 4.4 Housekeeping and delivery (L11-L14)
Delete `web/app/status`. `/dev/cards` calls `notFound()` when `NODE_ENV === "production"`.
CI `.github/workflows/ci.yml`: Python 3.12, `pip install -r workers/requirements.txt`, `pytest workers/tests`;
Node 24 in `web/`: `npm ci`, `npm test` (= `node --test scripts/*.test.mjs`, which excludes `rls_test.mjs`),
`npx tsc --noEmit`. No secrets; `next build` is left to Vercel. Measure Today's gzipped JS with
`web/scripts/js-budget.mjs` (budget 150 KB, the script's default) and record the number in the README.
Card company name links to the Company page; "Who knows" results open an event-less call sheet
(questions and opener about the person's employer, no event context).

## 5. Alternatives considered
| Decision | Chosen | Rejected | Trade-off |
|---|---|---|---|
| Bull vs bear | Live + persistent cache + global cap (owner) | Offline in workers (4 reviewers' recommendation) | Keeps streaming/Refresh; costs a service key, two tables, more code |
| Edits vs ranking | Status/chart update; ranking fixed | Re-score on the device | Avoids a second copy of the scorer; a card can say "edited" without moving tier |
| Bundle | Measure and record | Split per day now | Splitting would break user thresholds and day-strip counts |

## 6. Risks and mitigations
| Risk | Mitigation | Residual |
|---|---|---|
| Service-role key leaks | Server-only module, never imported by a client component; Vercel secret | Key rotation is manual |
| Cap reached by abuse | Cap is global and small; cache hits are free; message says so | Legitimate users wait until tomorrow |
| Gemini overloaded on a cold cache | Existing retries; nothing stored; message + Try again | Cold companies may fail at peak |
| Validator drops correct sentences | Count shown; drop rate measured on the snapshot before shipping | Fewer sentences |
| Parser refuses a real filing | Real M&M fixture must still parse; refusal shows a clear message | A new format needs a fix |
| CI logs public | No secrets configured | None known |

## 7. Implementation plan
Order: Blocker docs fix → bull vs bear (L2-L4) → parser (L8) → assumption (L5) → correctness (L6, L7,
L9, L10) → housekeeping/UX (L11, L14) → CI (L12) → measure (L13) → final docs (L1b). One commit each;
UI steps checked on the deployed link at 375 px; others by their tests.

| Step | Files (C = create, M = modify, D = delete) | Done when |
|---|---|---|
| 1 Holding fix | M `README.md`, `docs/WRITEUP-draft.md` (model use, bull vs bear and editor built) | No Blocker drift lines remain |
| 2 Guard + validator | C `web/lib/supabaseServer.ts`, `web/lib/numcheck.ts`, `db/migrations/0003_bull_bear_cache.sql`, `web/scripts/numcheck.test.mjs`; M `web/app/api/bull-bear/route.ts`, `web/lib/bullbear.ts`, `web/components/company/BullBear.tsx`, `web/lib/copy.ts`, `workers/tests/test_privacy.py` (TS deny-list matches Python) | Tests pass; owner ran the migration and set the key; deployed: cold generate → cache → instant replay; cap message at cap 1 |
| 3 Parser | M both parser copies, `py/main.py`, `web/lib/ensure.ts`, `web/components/ask/AskView.tsx`, `web/lib/copy.ts`; C fixtures + `workers/tests/test_xbrl_units.py` | 40+ tests pass; M&M fixture unchanged; PIDILITIND still reads in Ask |
| 4 Assumption | M `web/lib/assumption.ts`, `workers/build_digest.py`, `web/lib/digest.ts`, `web/lib/api.ts`, `web/components/today/EventCard.tsx`, `web/components/portfolio/PortfolioView.tsx`, `web/app/(tabs)/portfolio/page.tsx`, `web/components/company/InvestorAssumption.tsx`, `web/components/trust/SheetHost.tsx`, `web/lib/sheet.ts`, `web/lib/companies.ts`; C `web/scripts/override.test.mjs` | Edit on Company → same status on Today and Portfolio (deployed) |
| 5 Correctness | M `web/components/settings/ResetDemo.tsx`, `web/lib/settings.ts`, `web/lib/types.ts`, `web/lib/format.ts`, `web/lib/companies.ts`, `web/app/(tabs)/company/[symbol]/page.tsx`, `web/components/ask/AskView.tsx`, `web/fixtures/index.ts`, `workers/thesis.py`, Settings page; C `db/migrations/0004_promise_status.sql` | Reset clears both tables; ₹169.20 shown; tests pass |
| 6 Housekeeping/UX | D `web/app/status`; M `web/app/(tabs)/dev/cards/page.tsx`, `EventCard.tsx`, `AskView.tsx`, `web/components/people/CallSheet.tsx`, `SheetHost.tsx` | `/status` 404; card name opens Company; "Who knows" opens a sheet |
| 7 CI | Dropped by owner decision (no CI). M `web/package.json` (`test`, `budget` scripts) moves to step 8 | — |
| 8 Measure | run `npm run budget`; M `README.md` | Number recorded |
| 9 Final docs | M `README.md`, `docs/WRITEUP-draft.md`; one-line banner on `docs/FRONTEND.md`, `docs/design-v2.md` | Drift re-run: zero Blocker/Major on README/writeup |

Migration numbers: `0003_bull_bear_cache.sql` (step 2: cache table, daily counter, both RLS-on with no
policies) and `0004_promise_status.sql` (step 5). Owner steps: run each migration before its step
deploys; add `SUPABASE_SERVICE_ROLE_KEY` (and optionally `BULL_BEAR_DAILY_CAP`) in Vercel before step 2
deploys. The route returns a clear "not configured" message if the key or table is missing.
