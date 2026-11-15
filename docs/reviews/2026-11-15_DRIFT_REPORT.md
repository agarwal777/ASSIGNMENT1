# Drift report — 2026-11-15

Produced with the Elephant-Goldfish Model `egm-drift-report` procedure (plugin `egm@egm` v0.1.1).
One fresh-context reviewer per document compared it with the code at commit `076f8ab`, read-only.
Only differences are listed. Severity is the reviewer's, from a user-facing or correctness view.

Limits: EGM treats reviewer isolation as verified only on Claude Code ≥ 2.1.271; this run used
2.1.209, so read it as a fresh-context review, not a verified Goldfish run. Findings are reviewer
output; the ones acted on are re-checked before any change (see `2026-11-15_hardening.md`).
Spot-checked so far: `promises.status` constraint (0001_init.sql:60), `/status` route, unused
`MODEL_LARGE` / `DEMO_REPLAY_DATE`, demo network size (28 contacts, 49 stint rows) — all confirmed.

Most findings are of three kinds:
1. **The documents are stale** — bull vs bear, the assumption editor, Settings thresholds and the
   new date model shipped after the README, writeup, FRONTEND.md and design-v2.md were written.
   The README and writeup still say "a model is used in exactly one place" and "bull vs bear is not
   built". For a submission, these are the highest-risk lines.
2. **The prototype took planned shortcuts** that the design describes as built (Postgres as the
   source of truth, per-user scores, route handlers, CI, Playwright, a service worker).
3. **Real loopholes in shipped code** — collected and prioritised in the hardening design.

---

## README.md

- [Blocker] §4 decision 2 (l.86-87), §7 table (l.153-157): "A model is used in exactly one place". Bull vs bear calls Gemini twice per company (`web/app/api/bull-bear/route.ts`, `web/lib/bullbear.ts:68-100`).
- [Blocker] §9 (l.181), §12 (l.258): bull vs bear listed as "Not built" / next work; it ships (`web/components/company/BullBear.tsx`).
- [Major] §1 step 1 (l.17-18): Today "opens on 6 Nov 2026, 08:00"; it opens on the latest brief, 15 Nov (`web/lib/api.ts:36-38`). The walkthrough's "tap ›" no longer exists.
- [Major] §6 Models (l.145): only the `workers/llm.py` router is described; bull vs bear uses its own TypeScript deny-list (`web/lib/bullbear.ts:16,70`).
- [Major] §7 Spend (l.162-163): the ₹0 / 12 calls / ~194k tokens figures cover extraction only; bull-vs-bear calls are not logged or counted.
- [Major] §9 (l.182): "Assumption editor … cut for time"; a per-company editor ships (`web/components/company/InvestorAssumption.tsx`, `user_assumptions`).
- [Major] Settings screen with editable thresholds and Reset demo is not mentioned (`web/app/(tabs)/settings/page.tsx`, `web/lib/settings.ts`).
- [Major] §11 setup (l.248) omits `db/migrations/0002_user_settings.sql`.
- [Major] §11 (l.249): `GEMINI_API_KEY` is described as extraction-only; the Next.js server needs it on Vercel for `/api/bull-bear`.
- [Major] §11 tests (l.251): "34" Python tests; there are 40 collected cases.
- [Nit] §3 (l.49): replay range "31 Oct–15 Nov"; brief days start 1 Nov (`api.ts:39,44-48`).
- [Nit] §7 (l.161): default model in code is `gemini-3.5-flash-lite` (`workers/llm.py:52`); 3.6 only via `.env.local`. `MODEL_LARGE` undocumented.
- [Nit] §11 (l.251-253): `assumption.test.mjs` and `moves.test.mjs` not listed.
- [Nit] §6 (l.143): RLS description omits `user_settings`, `user_assumptions` (now covered by `rls_test.mjs`).
- [Nit] §1 step 3 / §9 (l.26-27, l.180): "Delivered" / "at risk"; UI says "Met" / "Behind".
- [Nit] §10 (l.211): "Both were clear FINN misses" follows a list of seven; unclear which two.
- [Nit] Not mentioned: Mark reviewed (localStorage), date-aware Portfolio, `/status` smoke page and `/dev/cards` still routable, transcript search on unseen tickers.

## WRITEUP-draft.md

- [Blocker] Decision 2 (l.43-44): "One model step only". Bull vs bear also calls Gemini.
- [Blocker] "What I left out" (l.63): bull vs bear and the thesis editor "not built"; both ship.
- [Major] Push (l.28): "replaying 6–7 Nov"; app opens on 15 Nov and replays 1–15 Nov.
- [Major] LLMs (l.55-56): spend/tokens exclude bull vs bear; the live Vercel model call and its key are not mentioned.
- [Major] Header (l.3-4): "Facts below match the README and the live app" no longer holds.
- [Nit] "Any ticker" (l.37): Havells cited but not measured (`eval/unseen_tickers.csv` has DIXON, POLYCAB, HDFCBANK, NOTASYMBOL).
- [Nit] Decision 3 (l.45-46): "an LLM router that refuses network fields" — bull vs bear uses a separate TypeScript deny-list.
- [Nit] Settings / editable thresholds not mentioned.

## FRONTEND.md

**Routes and URL state**
- [Major] §3 L83: `window=custom:<from>..<to>` and a WindowPicker; only `24h`/`7d` exist (`TodayView.tsx:21,55`).
- [Major] §3 L84 / §5.2 L220: `?sort=` and a sort menu; Portfolio has local-state filter chips instead (`PortfolioView.tsx:17-23`).
- [Major] §3 L85 / §5.1 L211: `?assumption=` deep link from the card's assumption line; not read, not a link (`EventCard.tsx:46-49`).
- [Major] §3 L86: Ask intents `promises · bullbear · who`; only `promises | who` (`AskView.tsx:40,51,60`).
- [Major] §3 L91-92: every sheet is URL state; the assumption editor is local `useState`, so back doesn't close it (`InvestorAssumption.tsx:25,73`).
- [Major] §3 L93 / §13 L491: `DEMO_REPLAY_DATE`; not read. "Results week" is hard-coded (`api.ts:42`).
- [Major] §3 L93 / §5.1 L173: replay banner with a "Back to live" reset; none — only the day strip.
- [Nit] §3 L92: sheet params list is incomplete (label, at, el, per, unit, val, excerpt, text, calc, contact, promise; `quote` sheet).

**Design system**
- [Major] §4.2 L119-121: stance vocabulary/icons (supports/contradicts/unclear); UI uses On track / Met / Behind / Missed / Can't check yet (`status.ts:11-17`).
- [Nit] §4.2 L108: tokens in `app/styles/tokens.css`; they are in `web/app/globals.css`.
- [Nit] §4.4 L143: components format numbers themselves (`LedgerTimeline.tsx:21,33-34`, `DayStrip.tsx:7-8`, `EventCard.tsx:107`).

**Today**
- [Major] §5.1 L167 / §12 L470: server-rendered `GET /api/digest`; Today is a client component computing the digest from bundled JSON (`TodayView.tsx:1,73`).
- [Major] §5.1 L174: header "3 touch your theses"; code shows "N need you" and `totals.touched` = cards shown (`api.ts:311`).
- [Major] §5.1 L178: "nothing in the collapsed tier is hidden"; collapsed events without a URL are counted but not listed (`api.ts:303-305`).
- [Major] §5.1 L184-193 / §6.2: card anatomy and MetricTable placement differ (tiles, trend, bullet charts, "All numbers", Mark reviewed).
- [Major] §5.1 L210: company name should open the Company page; it is a plain span (`EventCard.tsx:31`).
- [Nit] §5.1 L174: reading estimate never null. L176: cards ranked > 5 move silently to Worth a read. L179: done state shows SCORING_NOTE. L191: "no person" line shown instead of hidden. L204: `material` card `fields` never filled.
- [Nit] Undocumented: Mark reviewed + progress, DayStrip, Results week, on-device N re-ranking, re-scoring with user thresholds.

**Portfolio**
- [Major] §5.2 L216: `GET /api/portfolio`; rows come from bundled `companies.json`.
- [Major] §5.2 L221: row anatomy differs; `MiniThesisStrip` is unused; credibility not on the row.

**Company**
- [Major] §5.3 L228: `/api/company/:symbol`, `POST …/bullbear`, `PATCH …/assumption/:id`; actual: bundled JSON, `/api/bull-bear`, browser → Supabase upsert.
- [Major] Share price rendered as `kind: "count"` (whole rupees) with "₹" outside `Num` (`page.tsx:50`, `companies.ts:79`, `AskView.tsx:161`).
- [Major] §5.3 L235: ledger statuses/patterns differ; "revised" has no bar; scale capped at 2028-03-31 (`LedgerTimeline.tsx:63`).
- [Major] `0001_init.sql:59-60` constrains `promises.status` to the old vocabulary; code uses `on_track/behind/met/missed/cant_check`.
- [Major] §5.3 L241: `ReducedNotice` / reduced mode; `getCompany` always returns `mode: "full"`; non-snapshot symbols → `notFound()`.
- [Nit] Back always links to /portfolio; credibility counts not tappable; snapshot items `editable: false` yet the UI edits; SnapshotTable behind a disclosure; bull vs bear hidden without quarters; localStorage cache undocumented.

**Ask**
- [Major] §5.4 L245/252: "Who knows" results are plain items with no tap → no CallSheet; `PathCard` absent.
- [Major] §5.4 L250: no Bull vs bear intent chip.
- [Major] §5.4 L252: unseen ticker renders inline in /ask, not as a reduced Company screen.
- [Nit] §5.4 L249: ticker list fetched (128 KB) on first focus, not bundled.

**Sheets, Settings**
- [Major] §5.6 L270: Reset demo re-seeds only contacts; `user_settings` and `user_assumptions` are left (`ResetDemo.tsx:15-18`).
- [Nit] SourceSheet span highlight; CallSheet current role and WhatsApp share; QuoteSheet later related quotes; assumption invalidation note; statistical thresholds toggle; category checkboxes; README link; hard-coded "data to 14 November 2026" in Settings copy.

**Components, data layer, streaming, trust**
- [Major] §6.5 L341: numbers rendered outside `Num` with no source: Portfolio move tags, TrendChart caption, ledger targets, DayStrip counts, bullet captions, template headlines.
- [Major] §7.1: no server-side Supabase reads, no `useSWR`, no route-handler mutations; undocumented thresholds pub/sub.
- [Major] §7.2: `web/lib/types.ts` claims "§7.2 verbatim" but §7.2 types carry extra fields (`SourceRef.fact/text`, `NumValue.calc`, `assumption.status/claim`, `tiles`, `trend`).
- [Major] §7.2 L393: Python service payloads are hand-mirrored (`py/main.py` dicts ↔ `web/lib/ensure.ts`); no generated types.
- [Major] §8 L422: bull vs bear has no Stop button (`stream.stop` unused).
- [Major] §12 L470-471: `digest.json` (222 KB raw), `moves.json` (46 KB), `executives.json` are in the Today client bundle (gzipped size not measured).
- [Major] §13 L494 / §17 L589: Playwright `tests/e2e/hero.spec.ts` absent.
- [Nit] §8: `useNdjsonStream` signature; `done.redirect` vs `company`; undocumented `side_done`. §9 L432: frontend does not assert citations. §10: no service-worker fallback, company error copy, sheet skeletons. §13: 192 px icon, service worker, `/api/demo/seed`. §14: strings outside `copy.ts`. §15: folder layout; `/status` and `/dev/cards` routable; `0002` tables undocumented. `js-budget.mjs` not wired to npm.

## design-v2.md

**Architecture**
- [Major] §4.1-4.2: Postgres as single source of truth; no worker writes to Supabase; public-corpus tables, `evidence_links`, `network_overlaps`, `event_scores` are never filled or read. App reads bundled JSON.
- [Major] §12 L750-776: repo layout differs; no `.github/` — no production cron (§4.5, §11) and no CI.
- [Major] §13 L793-802: local-setup commands reference modules that don't exist.
- [Nit] §4.3: no `workers/adapters/`, no BSE fallback. §4.4 P5: `py/xbrl_results.py` is a hand-synced copy; no pymupdf/yfinance in py.

**Screens and flows**
- [Major] §3.3 Ask: no bull-vs-bear chip; no theme/expertise search (contact `tags` unused).
- [Major] §3.3 Company: status vocabulary differs; no `revised`/`dropped`; DB constraint uses the doc's vocabulary.
- [Major] §3.4 F4 / §6.6: an assumption edit never changes the brief — Today cards, stance, triage T and the next question still use the seed assumption.
- [Nit] custom window; "touch your theses" count; unseen tickers show 4 of 8 quarters; undocumented Portfolio/Settings/`/status`/`/dev/cards`/progress/day strip/next event/charts.

**Pipelines**
- [Major] P1/§5: triage scores are global (`digest.json`), not per-user `event_scores`.
- [Major] P4 step 4: overlaps computed in the browser, `network_overlaps` never written.
- [Major] P5: unseen tickers never extract promises (`mode` always "reduced"); no caching; lender detection by name regex.
- [Nit] P1 no small-model classification of residue; P3 keeps ≤ 4 checkable claims; P4 exact org matching (no rapidfuzz) and hand-transcribed executive stints.

**Data model**
- [Major] L474: `notes`, `thesis_revisions`, `feedback`, `users`, `org_relations` absent.
- [Nit] split stints tables, no education fields; `prices` has close/volume only; extra columns; facts store file URL, not XBRL element (`calc.ts` re-derives element names).

**Parser, triage, promises, network**
- [Major] §6.1 L492 / §18 L916: no unit detection — parser assumes rupees; a lakh-denominated filing would be off by 10^5.
- [Major] §6.2 L513-515: surprise S uses hard-coded cut-offs, not z-scores; no category-frequency surprise; price/volume S independent of user threshold.
- [Major] §6.4 L572-581: credibility excludes revised, no 12-month window, hidden unless resolved ≥ 2.
- [Nit] EBITDA falls back to PBT including exceptionals when PBE missing (only warns); 1 real-filing parser test; N not in bucket; T ≥ 0.4 for every event; FLOOR excludes KMP changes and downgrades; no z-score alert options; promise schema/validation differences; no `dropped`; revision by key match; only EBITDA margin cross-checked; network score formula and extra constants differ; no expertise map / "who can challenge my thesis"; 28 vs ~40 contacts.

**AI usage and trust**
- [Blocker] §8 L683-688: no number validator for model output — bull-vs-bear numbers are rendered after only a citation check (`web/lib/bullbear.ts:88-95`).
- [Major] §8 L679 / §3.5: bull-vs-bear sentences carry no INFERRED ("FINN's read") label.
- [Major] §7 L657/661: bull vs bear should use the frontier model via `MODEL_LARGE`; uses `MODEL_SMALL || gemini-3.6-flash`.
- [Major] §7 L661: no single router across runtimes; the TS path logs nothing; Python logs to a file, not `llm_calls`; `cost_inr` hard-coded 0.
- [Nit] Worth-a-read summaries are NSE text, not model summaries; caching by prompt hash, not document hash; bull/bear evidence pack omits the investor's own assumptions.
- [Nit] No passage highlight in the source sheet; no press-release vs XBRL conflict detection.

**Security, deployment, API, tests**
- [Major] §14 L833-843: most listed API routes do not exist (only `POST /api/bull-bear`, `GET /api/py/health`, `POST /api/py/ensure_company`).
- [Nit] RLS policy list names tables that don't exist; contact delete cascade; env vars: `DEMO_REPLAY_DATE`, `VAULT_KEY`, `LLM_API_KEY_*` unused, `GEMINI_API_KEY`/`MODEL_FALLBACK` undocumented; hard-coded dates (`RESULTS_WEEK_DAY`, `thesis.py SNAPSHOT_DATE`, `build_digest.py`); seed file columns; "PWA" without a service worker.
- [Nit] §16 L889: privacy test covers the Python router only; the TS bull/bear path is untested and unlogged.

## Links to add (consolidated)

Each section of README, FRONTEND.md and design-v2.md should name its implementing files. The
reviewers' full lists map: Today → `web/components/today/*`, `web/lib/api.ts`; Portfolio →
`web/components/portfolio/*`, `web/lib/companies.ts`; Company → `web/app/(tabs)/company/[symbol]/page.tsx`,
`web/components/company/*`; Ask → `web/components/ask/AskView.tsx`, `py/main.py`, `web/lib/ensure.ts`;
Sheets → `web/components/trust/SheetHost.tsx`, `web/lib/sheet.ts`; Settings → `web/components/settings/*`,
`web/lib/settings.ts`, `db/migrations/0002_user_settings.sql`; triage → `workers/classify.py`,
`workers/build_digest.py`, `web/lib/moves.ts`; parser → `workers/parsers/xbrl_results.py`, `py/xbrl_results.py`,
`web/lib/calc.ts`; promises → `workers/extract_promises.py`, `workers/ledger.py`, `workers/thesis.py`,
`web/lib/status.ts`; network → `web/lib/network.ts`, `web/lib/people.ts`, `web/lib/vault.ts`; AI →
`workers/llm.py`, `web/lib/bullbear.ts`, `web/app/api/bull-bear/route.ts`; evaluation → `eval/*`.
