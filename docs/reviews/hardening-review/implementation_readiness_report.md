# Stage 9 — Implementation readiness

Target: DetailedRange 143-182. Reviewers (fresh context): `egm-implementation-readiness` and
`egm-codebase-details` (standard: implementation-readiness-standard), `egm-style`.
Verdicts: readiness FAIL (3 Blocker / 9 Major / 6 Nit); codebase details not ready (4 / 18 / 3);
style 0 / 6 / 10.

## Blockers
- **Open decisions inside the plan** (zero-decision rule): storage, N/M, CI approval, bundle budget
  (`web/scripts/js-budget.mjs` defaults to 150 KB), conditional "no new secret".
- **Cache option (b) not shared on Vercel** (both; re-checked in stage 7). Also the default `cacheLife`
  profile revalidates after 15 minutes; a streamed response is not a cacheable value.
- **Quota/logging path not implementable:** `llm_calls` exists with RLS and no policies; no service key
  or RPC named; `bull_bear_quota(user_id, day, n)` cannot enforce per-company/hour M; token verification
  needs a per-request server Supabase client that does not exist.
- **Planned Node test cannot load `bullbear.ts`:** runtime `@/` imports (`companies`, `format`,
  `status`) are not resolved by `node --test`; `NETWORK_FIELDS` not exported. → alias-free module
  (e.g. `web/lib/numcheck.ts`) + a test that the TS deny-list matches `workers/llm.py:29-30`.

## Major
- **No file boundary** (Create / Modify / Delete per step). Unnamed files that must change:
  `route.ts`, `useNdjsonStream.ts` (headers, 429 handling), `copy.ts`, `sheet.ts`, `CallSheet.tsx`,
  `py/main.py` + `ensure.ts` (unit errors are swallowed at `py/main.py:111,147`, re-checked), price call
  sites (`companies.ts:79`, `page.tsx:50`, `AskView.tsx:161`, `fixtures/index.ts:117`, `format.ts`
  `formatValue`/`spoken`), `settings.ts` (no reset export), `package.json` (no `test`/`budget` script).
- **Phasing:** docs in step 1 go stale after steps 2-8 → Blocker statements first, final docs/test-count
  step last; migration before deploy.
- **Migration:** one file, re-runnable (`drop constraint if exists`), new values listed, and the column
  **default `'unverifiable'` must change too** (re-checked, `0001_init.sql:59`).
- **Validator rules unspecified** (tokens, tolerance, Unicode minus from `format.ts:4`, ranges, "Rs",
  quarter labels, counts, spelled-out numbers); reuse `inrCr`/`pct`/`bps`.
- **Client side of step 3:** `useNdjsonStream.start` takes no headers and throws on 429, losing the
  message; no token getter; `ensureDemoSession` re-seeds on every call.
- **Stop:** client abort doesn't stop server spend unless `request.signal` is passed; outcomes of a
  stopped partial result unspecified.
- **Per-user limit bypassable** (repeated from stages 5-8).
- **Assumption store name collision** (`assumption.ts` vs `assumptions.ts`) and **the "reason builder"
  doesn't exist in `api.ts`** — "behind your assumption" is baked offline into `e.reasons`
  (`build_digest.py:275`); cards carry no quarters; `dataTo` for replayed days unstated; `thesis[0]` may
  be a management item; Portfolio claims are built once server-side.
- **SheetHost editor:** needs quarters/seed/dataTo it cannot get from URL params.
- **Step 4 Node test cannot run** (same alias problem) → test a pure `applyOverride` helper.
- **Parser:** `decimals` rule wrong (re-checked); unit check only on `ELEMENTS`/associates facts;
  EBITDA sign by arithmetic; named exception + user-facing copy; define "identical" for the parity test.
- **"Who knows" call sheet has no event** — `CallSheet` requires `eventId`; needs an event-less mode.
- **Bundle step would break shipped features** (thresholds re-detection, day-strip counts); path is
  `web/scripts/js-budget.mjs`.
- **CI recipe incomplete:** install, working dirs, `node --test web/scripts/*.test.mjs` (excludes
  `rls_test.mjs`), Python version, public env vars for `next build`.
- **Test plan** missing for 401/429, cache hit, Reset, `/dev/cards` 404, card link, date derivation,
  RLS on any new table.
- **Ordering claim** ("highest risk first") doesn't match the steps; **exit criteria** only on step 1;
  "tested at 375 px" doesn't apply to non-UI steps.

## Nits
`thesis.py` date (15 Nov) vs app `dataTo` (14 Nov) must agree; dropped-count type fields; where test
counts are run from; explicit `.eq("user_id", uid)` deletes; collapsed-row `source` type; `/dev/cards`
guard mechanism; Stop discards partial results; consistent repo-relative paths; numbered heading.

## Reuse confirmed by the codebase reviewer
`EpistemicTag e="INFERRED"`; `useNdjsonStream().stop`; `checkAssumption`/`load`/`saveAssumption`;
the `settings.ts` pub/sub pattern; `useSheetNav`/`SheetHost`; `formatValue`/`inrCr`/`pct`;
`workers/llm.py` usage logging and `seed/llm_calls.jsonl`; `DATA_TO_DAY`/`LATEST_DAY`/`BRIEF_DAYS`;
`web/scripts/js-budget.mjs`; the existing `llm_calls` table.
