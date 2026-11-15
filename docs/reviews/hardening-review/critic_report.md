# Stage 7 — Critic review

Target: `docs/reviews/2026-11-15_hardening.md`, FeatureRange 1-142. Reviewers (fresh context):
`egm-design` and `egm-structural` (standard: feature-spec-standard), `egm-style`. Context: drift report.
Totals: design 3 Blocker / 9 Major / 4 Nit; structural 1 Blocker / 6 Major / 5 Nit; style 0 / 12 / 15.

## Blockers

- **No Alternatives Considered section** (design B1, structural B1). The standard fails a spec with a
  single path. Missing comparisons include: offline bull-vs-bear generation vs a live route; persistent
  shared store vs in-memory cache; rate limit by IP/firewall vs per-anonymous-user; one shared parser
  vs two copies; measure the bundle vs split now; client re-check vs server re-score; CI on Actions vs a
  pre-push hook. → Add §5 Alternatives (Decision | Chosen | Rejected | Trade-off).
- **Recommended cache option (b) is not shared on Vercel** (design B2). **Re-checked** in the bundled
  Next.js docs (`use-cache.md` l.245-261): the default `use cache` handler is in-memory; on serverless,
  entries "typically don't persist across requests"; neither directive survives a deploy. Also a
  streamed `ReadableStream` is not a serializable cached value. → Choose a persistent store (Supabase
  table + service key, or `use cache: remote` with its cost) with single-flight on a cold cache, or go
  offline.
- **Parser rule would reject the only real fixture** (design B3; same as stage 5 B1, already re-checked).

## Major

- **Per-user limit is bypassable; real bound undefined** (design M1, structural M1, style M8). Anonymous
  sessions are free to mint (`supabase.ts:13`). One generation can be up to 12 upstream requests (2
  models × 3 attempts × 2 sides, `bullbear.ts:73-83`). → State the worst-case daily request count vs
  quota; add a global daily cap; say how the route verifies a token (no server Supabase client exists).
- **`llm_calls` logging contradicts "no new secret"** (design M2, structural M3, style M8): RLS on, no
  policies (`0001_init.sql:183-184`). → service-role key or a SECURITY DEFINER RPC, counted in migrations.
- **Stop does not stop spend** (design M3): `stop()` aborts the client fetch; the route ignores
  `request.signal`. → Finish and cache server-side, or pass the signal and skip the cache write; test it.
- **Old unvalidated results stay on devices** (design M4): `localStorage` key `finn.bullbear.<symbol>`
  would keep showing pre-validator output. → Version the key or store evidence hash + validator version.
- **Validator under-specified; presence is not attribution** (design M5, style M4/M5, structural N4): a
  number can appear in a 420-char quote yet be applied to another metric; tokenizer, skipped tokens
  (Q2, FY27, counts), format normalisation (₹ bn/cr/k), computed bps all unspecified. → Specify, test,
  measure the drop rate on the snapshot first, or narrow the goal wording.
- **EBITDA fallback sign guess** (design M6; stage 5): determine the exceptional-item sign by
  reconciliation, as associates are, or keep the PBT fallback; add a fixture.
- **Node privacy test can't run as written** (design M7): Node type-stripping has no `@/` alias
  resolution; `prompt()` not exported; no `npm test` script. → Alias-free module, `npm test`, pinned Node.
- **CI build needs public env vars** (design M8): `supabase.ts` calls `createClient` at module load.
  → Set the public URL/anon key (or placeholders) in the workflow; define "lint" (`eslint` has no path).
- **Non-goals don't cover Goal 1** (design M9, structural M2, style M2): CI is listed as a recorded-only
  shortcut yet built; Playwright, route handlers, z-score surprise, numbers outside `Num`, reduced
  Company mode, hand-mirrored payload types, `MODEL_LARGE` have no disposition. → Appendix giving every
  drift Blocker/Major one disposition: fixed (§), documented as not built, or rejected with reason.
- **No sequencing or acceptance checks** (design M10, style M3): docs must come after code; owner steps
  (migrations, secret) unordered. → Order code → migrations → owner steps → docs; one verifiable check
  per goal; final drift re-run as Goal 1's acceptance test.
- **Risks have no mitigations; security/failure modes missing** (structural M1): token bypass, Gemini
  outage on a cold cache, cache poisoning, counter growth, service key. → Risk | Type | Mitigation |
  Residual table.
- **Migrations inconsistent** (structural M4, comprehension 9): one plan for constraint + quota + RPC.
- **Undefined "M5" reference** (structural M5, style M12; comprehension Blocker).
- **Findings table hygiene** (structural M6, style M1/N5/N8): mixed severity qualifiers; evidence cells
  without paths/lines ("as cited"); L1 merges ~8 claims of different severity → split L1a/L1b; the
  "re-checked" claim needs a column saying what was checked and how.
- **Overclaiming goals** (style M3/M4/M9, comprehension 8): "every statement", "no model-written number",
  "refuses inputs it cannot read" → calibrate to what the mechanism checks.
- **Unstated values** (style M7/M11, comprehension 7/11, design N3): Refresh minimum age; the JS budget.
- **"Pure function"** (style M6, design N1): prompt input is fixed by evidence; output is not.

## Nits (selection)
Abbreviations not expanded at first use (EGM, CI, XBRL, EBITDA, PBT, RLS, RPC, bps); subjective words
("fast", "honestly", "small", "correct"); L4 bundles three defects; label level (sentence vs side);
double negative in the `/dev/cards` rule; repository visibility and what becomes public; Reset demo
should be one transactional `reset_demo_user()` RPC (existing `own_rows` policies already allow the
deletes); price kind `inr` should also drop `epistemic: "SAID"` and add a source; say whether existing
`promises` rows need mapping before the constraint changes; open DECIDEs should be listed in one place;
number the implementation plan heading.
