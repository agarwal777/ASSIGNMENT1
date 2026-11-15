# Stage 6 — Comprehension test

Target: `docs/reviews/2026-11-15_hardening.md`, FeatureRange 1-142, DetailedRange 143-182.
Reviewer: `egm-comprehension` (fresh context, document only, no standard, no source files opened).

## What this proposes (feature range, lines 1-142)
A hardening pass on an app called FINN, following a "drift report" that compared code with its
documents. It (1) rewrites README.md and WRITEUP-draft.md to match the code — chiefly that a "bull vs
bear" feature exists and calls Gemini live; (2) fixes loopholes in shipped code: the bull-vs-bear
endpoint gets a shared server cache, a rate limit and a check that drops sentences whose numbers don't
appear in cited evidence; a user's assumption edit should apply on every screen; Reset demo should also
clear saved settings and assumptions; prices should show paise; the XBRL parser should reject unit
formats it can't read; a database constraint is fixed; hard-coded dates go; and (3) records unbuilt
parts of design-v2 (Postgres reads, per-user scores, offline mode, others) as "not built". CI, bundle
measurement and two navigation links come last.

## How the existing system works, per this document
FINN shows investors Today, Portfolio, Company, Ask and Settings screens built from a static JSON
snapshot published by offline Python "workers". Supabase/Postgres stores user settings, assumptions,
contacts and promises; logins are anonymous Supabase sessions under row-level security. A model is
used in two places: offline promise extraction (logged, privacy-tested) and a live bull-vs-bear route on
Vercel (no authentication, cache or logging). Card rankings are scored offline. An XBRL parser exists in
two copies and assumes rupees.

The reviewer could write this only by inferring much of it: the document never says what FINN is, who
uses it, or what bull vs bear produces.

## Findings

- **Blocker 1 (l.63, 167):** "M5" is never defined (findings are L1-L14, steps 1-8). → Say "a guard in
  step 5 (`getDigest`)" or define the M series.
- **Major 2 (l.1, 9-16, 46-59):** FINN, its screens and bull vs bear are never introduced; "card", "brief
  day", "triage reason", "next question", "seed assumption", "collapsed event", "ledger quote" undefined.
  → Add a 4-6 line Context paragraph or link the README section.
- **Major 3 (l.3-5, 151-152):** EGM terms and "re-run the drift reviewer" are opaque. → Explain or link
  EGM; give a criterion a person can check.
- **Major 4 (l.53, 112-114, 168-169):** "EBITDA from PBT minus exceptional items" is not EBITDA unless
  finance costs and D&A are added back; sign convention unstated; "before-exceptional line" unnamed. →
  Write the full formula with XBRL elements and the sign rule.
- **Major 5 (l.110-112):** rejecting `scale`/`decimals` is unclear and may reject valid filings
  (`decimals` is precision). → Name exactly what is rejected; test on a real filing. (Same as stage 5 B1.)
- **Major 6 (l.83-85, 160-161):** the per-company hourly limit has no storage
  (`bull_bear_quota(user_id, day, n)` only); how the route writes `llm_calls` and calls the RPC without a
  service key is unstated; "no new secrets" depends on it.
- **Major 7 (l.76-79):** "refresh when older than a minimum age" contradicts the pure-function premise;
  minimum age unspecified; behaviour for stopped/failed streams unspecified. → Define Refresh; cache only
  complete validated results.
- **Major 8 (l.30, 31, 33):** goals overclaim — validator covers bull vs bear only (not extraction);
  ranking doesn't change after an edit; CI is conditional. → Narrow the wording.
- **Major 9 (l.116, 160, 170, 181):** migration numbering inconsistent and conditional. → One file or two
  numbered files, no conditional.
- **Major 10 (l.49, 93-94, 157):** "network field", "deny-list", "TypeScript model path", "privacy parity"
  undefined. → One sentence on what the privacy rule protects and where the deny-list lives.
- **Major 11 (l.127-129, 177-179):** "budget" never set. → State the KB budget and where it is configured.
- **Nit 12 (l.86-89):** validator wording ambiguous ("years excluded"); rounding and crore/lakh
  normalisation undefined.
- **Nit 13 (l.46, 148):** README sections in L1 don't match those edited in step 1.
- **Nit 14 (l.125-126, 141):** repository owner and visibility unstated.
- **Nit 15 (l.53, 115, 168-169):** the two parser copies are never located or explained.
- **Nit 16 (l.145, 153-162):** "highest risk first", yet the quota Blocker (L2) is step 3 after the
  validator.
- **Nit 17:** deployment URL and 375 px viewport not given; "stream.stop()" vs "the stream's abort";
  `SheetHost` and `checkAssumption` without paths.

**Overall (reviewer):** not understandable on its own — one Blocker, ten Majors, mostly from missing
context and parts that don't connect (rate-limit storage, migration numbering, refresh rule, EBITDA
formula). Findings 4 and 5 may be correctness problems, not just wording.
