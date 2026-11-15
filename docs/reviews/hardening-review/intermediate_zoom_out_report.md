# Stage 8 — Intermediate zoom-out

Target: full document, read with the stage 5-7 reports. Reviewer: `egm-zoom-out` (zoom-out-standard).
Verdict: revise before building. Altitude and the three-part frame hold; scope does not — a safe live
bull vs bear now needs ~11 extra mechanisms.

## Blockers
- **B1 — make offline bull-vs-bear generation the recommendation.** With stage 7 B2 (in-memory cache
  not shared on Vercel), the "no new secret" path is gone; a safe live route needs a persistent cache
  table, the service key, a global cap, single-flight, server token checks, abort handling, versioned
  localStorage, an RPC, a migration and a risk table — all to protect ~44 calls whose input is fixed by
  the snapshot. Smallest design: a worker step reads `web/data/companies.json`, builds the numbered
  evidence, calls `workers/llm.call` (deny-list, `seed/llm_calls.jsonl` log, prompt cache, privacy test
  already exist), runs the validator, writes `web/data/bullbear.json` (sentences, citations, dropped
  count, evidence hash); the Company page renders it on the server. Delete `route.ts`, the server half
  of `bullbear.ts`, the localStorage cache, Refresh, and `GEMINI_API_KEY` on Vercel. Cost: no live
  streaming, no re-sampling — state both. If the owner wants live anyway, the minimum honest set is a
  permanent Supabase cache keyed by symbol + evidence hash, no Refresh, the service key, one global daily
  cap, cache writes only for complete validated results, no per-user limit or token check.
- **B2 — parser: reject on unit only** (`iso4217:INR`, plus pure/shares where expected); one fixture. No
  magnitude check unless a real INR-unit filing with scaled values appears.
- **B3 — delete the impossible-case guard** and its "M5" reference (or assert in `build_digest.py`).
- **B4 — Alternatives: three rows only** — offline vs live bull vs bear; status-only vs on-device
  re-ranking after an edit; measure vs split the bundle now.

## Major
- **M1 (new, verified) — §4.3 hides a data flow.** `checkAssumption` needs each company's quarters;
  Today cards get only `digest.json` `thesis[0]` (no quarters) and `companies.json` is server-only by
  rule. → Pass compact quarters via Portfolio server props and add them per symbol to `digest.json`;
  keep the card's selected item fixed and say so; extend `lib/assumption.ts` with the `settings.ts`
  notify pattern; narrow Goal 4 to "status and bullet chart; ranking stays as computed offline".
- **M2 — "As built" sections double the drift surface.** One-line banner on FRONTEND.md and
  design-v2.md; one file map in the README.
- **M3 — remove the conditional bundle build-out.** Measure, record the gzipped KB in the README, stop.
- **M4 — CI only what needs no environment:** pytest, Node tests, `tsc`; skip `next build`/lint (Vercel
  builds on push); one local `npm test` the workflow calls; keep the visibility DECIDE.
- **M5 — validator simpler offline:** exact token matching against evidence built by the same step;
  skip four-digit years, `Q1-Q4`, `FY\d\d`; drop and count computed figures; owner reads the ~150-180
  sentences once before committing; Goal 3 narrowed to bull vs bear.

## Earlier-stage fixes not to adopt in this pass (they add scope)
1. Named numeric slots with a restricted calc (catalyst #2) — revisit only if the measured drop rate is
   unacceptable. 2. On-device scorer + parity test (catalyst #3). 3. Per-day input split (catalyst #4) —
   unmeasured. 4. Stage 7 risk-table rows for the live route. 5. Alias-free Node privacy test. 6. Versioned
   localStorage + upstream abort. 7. A ~60-row disposition appendix — the README "not built" list is the
   disposition. 8. A transactional `reset_demo_user()` RPC — two more own-row deletes suffice (or sign-out
   + fresh session; pick one). 9. Parser magnitude check. 10. Seven-row Alternatives table. 11. Generating
   `py/xbrl_results.py` — keep the parity test only.

Keep (necessary and small): context paragraph; full EBITDA rule without a sign guess plus a non-zero
fixture; `0003_promise_status.sql` as its own file; calibrated goal wording; delete `/status` before CI;
order code → owner steps → docs, with a final drift re-run as Goal 1's acceptance check.

## Nits
Plan steps should state components + a done-check, not helper names; label L14 (card link, call sheet)
as drift/UX fixes, not loopholes; the migration does not "add `llm_calls`" (it exists) — moot offline;
don't move Python logging to Postgres; date derivation and the documented `RESULTS_WEEK_DAY` are fine.

## Smallest design that resolves all Blockers (reviewer)
1 context paragraph · 2 README + writeup true, banners elsewhere · 3 offline bull vs bear via
`workers/llm.call`, exact-match validator, evidence-hash check, static render, "FINN's read" label; delete
route, key, localStorage · 4 assumption notify store + compact quarters; status changes everywhere,
ranking doesn't · 5 unit-only parser guard, EBITDA without sign guess, `0003_promise_status.sql`, two more
reset deletes, `inr` price kind, dates from data · 6 delete `/status`, guard `/dev/cards`, minimal CI if
approved, measure bundle, two UX links · 7 three-row Alternatives + remaining risks · 8 owner steps: one
migration, no new secret, remove `GEMINI_API_KEY` from Vercel.
