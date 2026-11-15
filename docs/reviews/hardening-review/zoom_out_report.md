# Stage 5 — Initial zoom-out review

Target: `docs/reviews/2026-11-15_hardening.md` (full file). Reviewers (fresh context): `egm-zoom-out`
(standard: zoom-out-standard), `egm-inventive-catalyst`. Context: `2026-11-15_DRIFT_REPORT.md`.

## egm-zoom-out — verdict: revise before building

- **Blocker B1 (l.110-115, step 5):** "reject any `scale`/`decimals` attribute that implies a multiplier"
  would reject every NSE filing. In a plain XBRL instance `decimals` states rounding precision, not a
  multiplier (XBRL 2.1 §4.6.5); `scale` exists only in inline XBRL. **Re-checked:** the M&M fixture has
  `decimals` on all 294 facts (-5, -6, -7, INF) and no `scale`. Keep only the unit check; detect
  lakh-denominated filings by unit or a magnitude sanity check.
- **Major (l.112-114):** "PBT minus exceptional items" re-introduces the sign guess the parser avoids on
  purpose (`xbrl_results.py:11`). Use PBT when exceptional items are absent or zero; otherwise reject the
  quarter's EBITDA or require the existing PBT − tax ≈ PAT reconciliation; add a non-zero-exceptional
  fixture before choosing a sign.
- **Major M1 (§4.2, steps 2-3):** bull vs bear is a pure function of the committed snapshot (~22
  companies, ~44 calls once). Generate it offline through `workers/llm.py` and ship JSON: removes the
  public endpoint, the Vercel key, the quota table, RPC and migration; reuses the existing deny-list,
  log and privacy test. Cost: no live streaming or Refresh (which only re-samples at temperature 0.2).
  If kept live: permanent cache per symbol + evidence hash, no Refresh.
- **Major M2 (l.83-85):** the per-user limit is bypassable — anonymous sessions are self-minted
  (`supabase.ts:13`). Only a per-company/global bound limits spend.
- **Major M3 (l.82, 92-93, 160, 182):** "no new secret" contradicts writing to `llm_calls`, which has RLS
  and no policies (`0001_init.sql:183-184`) — needs the service-role key or a SECURITY DEFINER RPC (itself
  an abuse surface). The table already exists, so "adds `llm_calls`" is wrong.
- **Major M4 (l.97, 163):** new `lib/assumptions.ts` next to existing `lib/assumption.ts` — extend the
  existing module with the `settings.ts` cache/notify pattern instead.
- **Major M5 (l.103-104, 139-140):** after an edit a card can sit in "Needs you" saying "behind your
  assumption" while its pill says On track; a per-card disclaimer papers over it. Either scope the goal
  honestly (status everywhere, ranking fixed) or re-bucket on the device (`eventsFor` already does this
  for moves).
- **Nits:** N1 implementation detail too low for a design (helper names, route shapes; per-day files
  could be emitted by workers into `public/`). N2 drop the impossible-case guard or assert it in the
  worker. N3 replace "As built" sections with a one-line banner pointing to the drift report. N4 Reset
  demo by signing out and starting a fresh anonymous session instead of listing tables (leaves orphan
  users). N5 name the constraint migration `0003_promise_status.sql`. N6 order: delete `/status` (the
  only static `@/lib/supabase` import) before adding CI, or `next build` needs env vars.

## egm-inventive-catalyst — five false compromises

1. **Major — live vs quota-safe (§4.2, steps 2-3):** same root as M1; the "live" requirement is not
   real for snapshot-only evidence. Precompute in the workers with an evidence-hash check that fails the
   build when evidence changes. Secondary: loses the live moment; bad output frozen until re-run;
   re-running needs the key. If kept live, minimum honest guard = global daily cap + evidence-hash cache,
   no Refresh.
2. **Major — recall vs verifiability (§4.2 validator, §5):** don't let the model write numbers. Give it
   named slots (`[3].revenue_yoy`) and a restricted calc (difference, ratio, bps change); the app fills
   values with `formatValue`/`NumValue.calc`; reject unknown slots and any literal digit outside an
   allow-list (years, quarter labels). Exact check, no rounding tolerance; derived figures become
   checkable instead of dropped.
3. **Major — status vs ranking (§4.3, §5):** the scorer is one linear formula and every event already
   ships `components {M,S,T}`; recompute T from the effective assumption on the device (shared
   `lib/score.ts` with `moves.ts`), with a parity test against `digest.json`. Secondary: two-language
   rule; cards move tiers after edits (add a reason line); memo key must include assumption version.
4. **Major (conditional) — bundle vs personalisation (§4.5, step 8):** per-day *precomputed digests*
   would silently ignore user thresholds and edits. Split *inputs* by day (events with components,
   moves slice with its 20-session look-back); keep scoring on the device.
5. **Nit — two parser copies:** generate `py/xbrl_results.py` from the workers copy (prebuild/CI step,
   "generated" header), keep the parity test. Packaging of `py/` not verified.

## Elephant notes (not reviewer output)
Both reviewers independently converged on generating bull vs bear offline. That is an owner decision:
it trades the live streaming demo for removing the endpoint, the key on Vercel and all quota work.
