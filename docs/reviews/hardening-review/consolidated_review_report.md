# Consolidated review — `docs/reviews/2026-11-15_hardening.md`

EGM Goldfish review, "Consolidated report with all review rubrics" (stages 5-9 run without stopping).
11 fresh-context reviewer runs: zoom-out ×2, inventive catalyst, comprehension, design, structural,
style ×2, implementation readiness, codebase details. Stage reports in this folder. Claims marked
**re-checked** were verified by hand against the code or the bundled Next.js docs.

**Verdict: do not build the plan as written.** It found the right problems but proposed the wrong fix
for the biggest one, and one rule (the parser) would have broken every filing. Four reviewers, working
independently, converged on a smaller design.

## What the reviewers changed in the plan

1. **Bull vs bear: generate it offline instead of guarding a live endpoint** (stages 5, 7, 8;
   catalyst #1). The evidence is fixed by the committed snapshot (~22 companies, ~44 model calls once).
   A safe live route needs ~11 mechanisms (persistent cache + service key, global cap, single-flight,
   server token checks, abort, versioned localStorage, RPC, migration…). Offline generation through
   the existing `workers/llm.py` reuses its deny-list, log and privacy test, removes the public endpoint
   and the Vercel key, and puts the number validator under pytest. Cost: no live streaming or Refresh.
   **This is your decision.**
2. **My recommended cache would not have worked** (stage 7 B2, stage 9; **re-checked**): plain
   `use cache` is per-instance memory on Vercel and doesn't survive deploys.
3. **My parser rule would have rejected every NSE filing** (stages 5-9; **re-checked**: all 294 facts in
   the M&M fixture carry `decimals`; none carry `scale`). Fix: reject on `unitRef` ≠ INR only, for the
   facts the parser reads.
4. **My EBITDA fallback guessed a sign** the parser deliberately avoids (stages 5-9). Fix: determine it by
   reconciliation, as associates are, or keep the PBT fallback; add a fixture.
5. **The per-user rate limit protected nothing** (anonymous sessions are self-minted) — moot if offline.
6. **"One assumption, everywhere" hid a data flow** (stage 8 M1, stage 9): Today cards have no quarters
   and the reason text is baked offline. Fix: ship compact quarter inputs; status and chart update
   everywhere, ranking stays as computed offline, and the goal says so. Extend `lib/assumption.ts`
   instead of adding `lib/assumptions.ts`.
7. **Migration:** its own file `0003_promise_status.sql`, re-runnable, and it must change the column
   **default** too (**re-checked**: default `'unverifiable'`).
8. **Docs last, not first** (stage 9): the README must describe the final code; a final drift re-run is
   the acceptance check. FRONTEND.md and design-v2.md get a one-line banner, not "As built" sections.
9. **Scope trimmed** (stage 8): no named-slot validator, on-device scorer, per-day bundle split,
   disposition appendix, reset RPC, magnitude check, or generated parser copy in this pass.

## Prioritised actions (after your decisions)

| Pri | Action | From |
|---|---|---|
| 🔴 | README + writeup: remove the false "one model use" / "bull vs bear not built" claims (first, as a holding fix), then make every number/command/date true at the end | L1; all stages |
| 🔴 | Bull vs bear offline (or the minimum live set) + exact-match number validator + "FINN's read" label | L2-L4; 5,7,8,9 |
| 🔴 | Parser: unit-only guard on read facts; EBITDA without sign guess; named error surfaced in Ask (`py/main.py` currently swallows it) | L8; 5-9 |
| 🟡 | Assumption edits update status and bullet chart on Today, Portfolio and Company; sheet in the URL | L5; 6-9 |
| 🟡 | Reset demo clears thresholds and assumptions and the in-memory stores | L6; 7,9 |
| 🟡 | Price as `inr` (₹169.20) with a source, at all call sites | L7; 7,9 |
| 🟡 | `0003_promise_status.sql` (constraint + default, re-runnable) | L9; 7,9 |
| 🟡 | Minimal CI (pytest, Node tests, `tsc`), one `npm test` command | L12; 8,9 |
| 🟡 | Measure Today's JS and record it; no split this pass | L13; 8 |
| 🟢 | Dates from data (Python and app agree on one day); delete `/status`; `/dev/cards` 404 in production; card name → Company; event-less call sheet for "Who knows" | L10, L11, L14 |
| 🟢 | Rewrite the hardening doc: context paragraph, 3-row Alternatives, risks with mitigations, file boundary, done-check per step, no open DECIDEs | stages 6, 7, 9 |

## Decisions only you can make
1. Bull vs bear: **offline** (recommended by four reviewers) or **live** (keep streaming/Refresh, add
   a service-role key on Vercel, a persistent cache table, a global daily cap).
2. CI: add a GitHub Actions workflow to the `agarwal777/ASSIGNMENT1` repository (yes/no).

## Traceability
Stage 5: `zoom_out_report.md` → items 1, 3, 4, 5, 6, 8, 9. Stage 6: `comprehension_report.md` →
doc rewrite, item 7, calibration. Stage 7: `critic_report.md` → items 2, 5, 7, Alternatives, risks.
Stage 8: `intermediate_zoom_out_report.md` → items 1, 6, 8, 9. Stage 9:
`implementation_readiness_report.md` → items 2-4, 6, 7, file boundary, tests, CI recipe.

## Limits
Reviewer isolation is unverified by EGM's definition (Claude Code 2.1.209 < 2.1.271). Reviewers had read
access to the code; none ran it. Severity labels are the reviewers'; priorities above are mine.
