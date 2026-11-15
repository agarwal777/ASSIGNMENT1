# Requirements drift — the ENAM brief vs FINN (15 Nov 2026)

Produced with the Elephant-Goldfish Model `egm-drift-report` procedure (plugin `egm@egm` v0.1.1),
using the brief and its reference document as the design documents. The brief was first turned into a
numbered list (`brief-requirements.md`: MUST / ASKED / MENU). Four fresh-context reviewers
(`egm:egm-codebase-details`) each checked one area against the code at commit `525588f`, read-only.
Claude Code here is 2.1.209, below EGM's 2.1.271 isolation requirement, so treat this as a
fresh-context review, not a verified Goldfish run.

Every finding below was re-checked in the code by the main session ("verified"), unless marked
otherwise. The brief grades "creativity, product sense, judgment, and architecture — not
completeness", and calls its frontend items "illustrations, not a checklist". A MENU gap is a choice to
explain, not a defect.

## 1. The writeup and README contradict the code (fix before submitting)

| Id | Sev. | Finding | Verified |
|---|---|---|---|
| F3 | Blocker | README §4 and WRITEUP-draft l.43 say "two model steps only" and "free-text agent: not built". The Company page now has bull vs bear (live) and the cited question box (live), a third model step. | yes |
| F5 | Major | README l.160–168, 185, 264 and the writeup l.57–67 say bull vs bear has no number check, cache, daily cap or call log. All four ship (`bullbear.ts`, migration 0003, `route.ts`). | yes |
| F4 | Major | The architecture diagram and cloud table omit the live Gemini calls from Vercel and the server-only tables (`bull_bear_cache`, `bull_bear_daily`, `llm_calls`). README l.92 says only Ask is live. | yes |
| F6 | Major | WRITEUP-draft l.21: the AI build history is still the placeholder "[link to exported sessions]". The brief requires it. | yes |
| F2 | Major | The writeup does not say how long personal data is kept, or how consent and access control would work for real. The policy exists only in `docs/design-v2.md` l.705–706. README l.147 says "only public transcripts are sent", but the live routes also send XBRL figures and the investor's question. | yes |
| D3/B1 | Major | No annual report is read anywhere. Only the in-app note says so (`copy.ts:391`); README §9 "left out" does not. | yes |
| D2 | Minor | NSE only; BSE is not fetched (`bseindia` appears only in a test fixture). Not stated. | yes |
| F1 | Minor | The rule that matches a name in a filing to a network contact (employer aliases, then tenure overlap, `network.ts`) is not described. | yes (absent from docs) |
| D5 | Minor | README l.55–56 sector list omits metals (TATASTEEL) and transmission (KEC). | not re-checked |

These are planned for step 10 (README and writeup rewrite). They carry the most risk because
reviewers read the writeup first.

## 2. Asked for by the brief, not built

| Id | Sev. | Finding | Verified |
|---|---|---|---|
| A2 | Major | The digest window is fixed to 24 h or 7 days (`TodayView.tsx:23`). The brief says "let me pick the period". README already lists "Custom window" as cut. | yes |
| A3c | Major | The investor cannot choose which announcement types count as material. Weights are a fixed table (`workers/classify.py:65-71`); Settings stores only the two move thresholds. | yes |
| A3b | Minor | Portfolio's "Needs you" list is built on the server with the default thresholds (`api.ts:53`), so it can disagree with Today after the investor changes thresholds. The price-chart alerts also use the defaults. | yes |
| A1 | Major | Push only happens when the app is opened: no notification, no scheduled refresh (snapshot data). README admits both as cut. | yes (by README) |
| C2 | Major | The mock network has nobody at the research companies (TITAN, ASTRAL, BHARATFORG, PIIND) or the Ask demos (Dixon, Polycab): `seed/network.csv` has 0 matches. The brief asks for overlap with research companies too. | yes |

## 3. Menu items: thin or missing

| Id | Finding | Verified |
|---|---|---|
| A4/C3/D4 | Incoming-executive profiles exist for one filing only (Voltas, 2 people); 15 other management-change events get the plain card. The profiles were transcribed by hand; no worker extracts them. Education is almost absent from the network. | yes (2 profiles, 16 events) |
| A6 | A person is attached only to the top "Needs you" cards; a material event ranked "Worth a read" gets none. | not re-checked |
| B4 | Of the eight Pull outputs: business snapshot (segments, revenue mix), balance sheet and cash quality are missing (the XBRL parser reads P&L only). The financial snapshot has no ratios, and the trajectory covers only quarters, not years. Narrative vs numbers and guidance exist for 3 companies only. | yes |
| B2/B3 | An unseen ticker gets prices and 4 quarters of P&L only. Bull vs bear and the question box refuse tickers outside the snapshot. The 4 research companies have no promise ledger. | yes |
| B5 | Promised vs delivered is incomplete for "the last four quarters": some transcripts failed or produced nothing (AUROPHARMA 1, M&M 2, Voltas 1 with 0 promises). | not re-checked |
| C4 | Suppliers are not modelled (relations have competitors, customers, partners); customer data exists for one company. | yes |
| C7 | No expertise map: contact tags are loaded but never used for matching; Who knows searches names and organisations only. | yes |
| C8 | Keep-warm fires on any contact unseen for 6+ months; it is not tied to a former employer's announcement and is not shown on Push cards. | not re-checked |
| C9 | Nothing is framed as "what it notices that you wouldn't". Second-degree paths from a filing come closest. | judgement call |
| A8 | `classify.py:5` says a small model handles the `unclassified` residue; no code does. | yes |

## 4. Not checkable from files

Mobile feel, design quality and end-to-end runs (E1–E4) need the live site; these were checked by hand
at 375 px during steps 1–9. Whether the GitHub repository is public was not checked.
