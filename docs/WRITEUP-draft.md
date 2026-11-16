<!--
DRAFT for the covering email, in your voice. Written so that a reader who has never opened FINN can follow
it, and technical where it matters. Read it once as yourself and change anything you wouldn't say in an
interview. Facts match the README and the code as of 15 Nov 2026.
-->

**To:** assessment@enam.com
**Subject:** IIT Delhi – Founding AI Engineer - 2027

Hello,

Here's my submission for the FINN challenge.

- **Prototype (mobile web app, no login):** https://assignment1-eta-dun.vercel.app
- **Code:** https://github.com/agarwal777/ASSIGNMENT1
- **AI build history:** https://gist.github.com/agarwal777/c12e2899ac714be0e69f44e40fc3420c

## 1. What I built

FINN is a mobile web app for an investor who holds a portfolio of Indian listed companies. It watches what
those companies file with the stock exchange (NSE), decides which filings matter, checks what management
promised against what was later reported, and points to people in the investor's own network who could
explain an event.

Most tools in this space are feeds. FINN starts from a different question: an investor holds a stock for a
reason, so the useful job is to tell them whether that reason still holds. The investor's reasons
(assumptions such as "EBITDA margin stays above 15% this year") and management's own guidance are stored
as checkable targets, and everything else is organised around them.

It has the three layers the brief asks for:

- **Push (the Today screen).** A daily brief of every exchange filing across the portfolio in a chosen time
  window (24 hours, 7 days or a custom start date). Each filing is classified, scored and placed in one of
  three groups: at most five cards that "need you", one-line items "worth a read", and routine paperwork
  folded into counted groups. A results card shows Revenue, EBITDA, PBT and PAT, each against the previous
  quarter (QoQ) and the same quarter last year (YoY), parsed from the company's results filing. Unusual
  price or volume moves are flagged against thresholds the investor sets. Under every filing, "What this
  filing means" shows how the share price actually moved after it (next close, five trading days, and the
  same for the company's earlier results), and on request a short summary of the filing PDF with what it
  means for a holder.
- **Pull (the Company page and Ask).** For any portfolio company:
  - **A promise ledger:** each measurable target management stated on an earnings call, quoted word for
    word, with its status against reported numbers (met, missed, on track, behind, or can't check yet, with
    the reason).
  - **The financials:** the balance sheet, cash flow and segment mix; quarter charts; a year of prices with
    filings marked.
  - **Model-written analysis:** a bull and bear case, and a question box, both answered only from the
    company's own filings.

  Ask extends this to any NSE-listed company, fetched live.
- **Network.** The investor's contacts (employers, roles, dates) are matched against companies and against
  people named in filings, such as a newly appointed director. Every card and company page ends with the
  best person to call and why. A call sheet gives three questions and a draft message, which the investor
  sends themselves. "Who knows…" answers direct queries by person, company or theme.

The demo uses 18 portfolio companies and 4 research companies. A batch snapshot covers 31 Oct–14 Nov 2026:
11,147 NSE announcements (251 for the portfolio), a year of daily prices, and recent results for 21 of the
22 companies. Since then, a daily cloud job adds each evening's new filings and closing prices on its own.
The network of 34 contacts is synthetic.

## 2. Key decisions and trade-offs

**A committed snapshot plus a daily refresh, not a live feed.** Exchange websites block automated requests
unpredictably, and free-tier model APIs fail often. A demo that breaks was the worst outcome, so the heavy
work (a year of history, transcripts, model extraction) is done in batch and committed with the app as JSON.
The app reads files and cannot break because a source is down. On top of that, a scheduled job runs once a
day after market close, fetches new filings and prices, and rebuilds the app with them. If a day's fetch
fails, the app simply keeps the previous day's data. The trade-off: FINN is end-of-day, not intraday, and
"push" happens when the app is opened, not as a phone notification.

**Deterministic code for numbers, models only for language.** Every number on screen comes from parsing a
filing or from a formula, never from a model, and each figure links to its source fact or its formula.
Filing classification is rule-based. This is slower to build than prompting a model, but every value can
be traced and reproduced.

**A brief that ends.** Ranking keeps at most five items in "Needs you". The cost is that the ranking can be
wrong. In a blind test on 40 filings, precision on what FINN chose to show was 0.54. So everything folded
stays one tap away, and the investor can force a type of announcement up or down (Alert / Mute).

**Only sourced relationships.** A company's "peer" is any company in the same industry in NSE's own
classification. Supplier and customer links appear only where a related-party filing names them. A network
link without dates is shown as "probable". Nothing is inferred and presented as fact.

**Instant re-ranking over bundle size.** The brief's data is kept in the browser, so changing the date or
the thresholds re-ranks without a server call. That puts about 39 KB of data into that screen's JavaScript.

## 3. Architecture

```
 BATCH (laptop)                         VERCEL (serverless)                    PHONE (browser)
 NSE announcements ┐                    Next.js: prerendered pages             · re-ranks with the
 XBRL results      ├─► Python workers ─► read the JSON  ◄────────────────────►   investor's settings
 daily prices      │   (rules, parsers,  API routes: bull/bear, question ──► Gemini   · matches the network
 call transcripts  ┘   formulas, cached  Python function: any ticker ──► NSE live    locally
                       model calls) ─► JSON  DAILY CRON: NSE + Yahoo ─► rows ─► rebuild
                                                               │                        │
                                                               ▼                        ▼
                     SUPABASE (Postgres): private per-user rows (RLS), shared answer cache, fresh market data
```

### Data pipelines

- **Filings.** Python workers download the NSE announcements feed (JSON) for the portfolio. Each filing is
  classified into ENAM's 17 categories with rules on its subject and text. It is then scored:

  `score = (0.35·materiality + 0.25·surprise + 0.30·thesis relevance) / 0.90`

  - **Materiality** comes from the category.
  - **Surprise** comes from the size of the change in the reported numbers.
  - **Thesis relevance** is 1.0 when results contradict a tracked target, 0.7 when they touch one, and 0.4
    otherwise.

  A score of 0.65 or more means "needs you", and 0.35 or more "worth a read". A network bonus is added
  later, in the browser, because it depends on private data.
- **Financials.** Quarterly results come from the companies' XBRL filings. XBRL is the machine-readable
  format in which Indian companies file results, with each number tagged by element, period and unit.
  - **Parsing:** each fact is matched to the right reporting period, checked to be in rupees (anything
    else is refused, not rescaled), and converted to crore.
  - **EBITDA:** profit before exceptional items and tax, plus finance costs and depreciation, minus other
    income. The share of associates is also subtracted when the filing puts it inside profit before tax,
    which the code works out by arithmetic.
  - **Statements:** the annual and half-year filings also carry the balance sheet, cash flow and segment
    revenue, parsed the same way.
  - **Checked:** against the companies' own results PDFs, the parser matched 8 of 8 line items for two
    companies.
- **Prices.** A year of daily closes and volumes. A move is flagged when volume exceeds a multiple of its
  20-day average, or the price moves more than ±X% in a day. Both thresholds are set by the investor. A
  move is "unexplained" if nothing was filed since the previous session.
- **Promises.** Earnings-call transcripts filed on NSE are read by a model (see below) into structured
  targets: metric, value, unit and deadline.
  - **Status rule:** for margin and growth, which are higher-is-better, a target is met or on track when the
    year-to-date actual is at or above the bottom of the guided range.
  - **Not checkable:** targets for a segment, a capacity, a date or an amount are marked "can't check yet",
    with the reason.
- **Linking people.**
  - **Matching:** employer names are canonicalised (legal suffixes removed, an alias table). Two people are
    linked if they held stints at the same organisation with overlapping dates.
  - **Strength:** `(1 − e^(−years/2)) × function match × size discount × e^(−gap since overlap / 10)`.
  - **Probable links:** if dates are missing, the link is shown but marked "probable".
- **Second exchange.** I didn't fetch BSE: its feed blocks scripts and its data is paid. For three companies
  over one week I compared BSE's public pages by hand, and all 23 BSE announcements were also on NSE. Each
  filing record keeps its source exchange and a dedupe key (company + date + subject), so adding a second
  feed later is a data change, not a redesign.
- **Daily refresh.** Once a day, after market close, Vercel's scheduler calls a Python endpoint, which
  rejects any request without the right secret. The job runs in four steps:
  - **Fetch.** One bulk call gets NSE announcements since the last successful run, kept for the portfolio
    companies, and closing prices for all 22 companies come from Yahoo in parallel.
  - **Score.** Filings are classified, grouped and scored by the same module as the batch pipeline; a test
    keeps the two copies identical. A new results filing is parsed from XBRL into a full results card.
  - **Store.** The rows go into Supabase, and every run is logged. If the filings fetch fails, the run is
    logged as failed, so the next run retries the same days.
  - **Rebuild.** If anything is new, the job triggers a redeploy. The build step merges the new rows into the
    app's data, deduplicating by id and dedupe key, and detects new price and volume moves with the same code
    the app uses.

  On a test day it produced the same events, scores and results numbers as the batch pipeline. One
  difference: fresh filings get FINN's base thesis-relevance score, because the full check against tracked
  targets needs the offline promise ledger.

### Security and privacy

- **Isolation.** The investor's contacts, settings and assumptions live in Supabase Postgres with
  row-level security (RLS). The database itself only returns rows whose owner is the signed-in user. I
  tested this with two accounts trying to read, insert, update and delete each other's rows; all were
  blocked.
- **Matching runs on the device.** The network is loaded into the browser and matched there, so no server
  of mine processes it. Explanations, questions and draft messages are templates, not model output.
- **Models never see the network.** Every model call passes a deny-list that refuses any payload containing
  a network field name. The list is identical in Python and TypeScript, and a test checks that. The
  question box also refuses, in the browser, a question that names one of the investor's contacts.
- **Demo vs real.** The demo signs each visitor in anonymously and gives them their own copy of the
  synthetic network; "Reset demo" deletes it. A real deployment would add named accounts, encryption of
  contact fields, a consent step for imported contacts under India's data protection law, and deletion that
  cascades to everything derived from a contact.
- **Keys.** Model and database service keys exist only on the server, never in the browser.

### LLMs and agents

A model is used in five steps, all on Google Gemini's free tier. Each is checked in code, not just
instructed in the prompt:

1. **Promise extraction (offline).** One call per transcript returns JSON with a fixed schema. Each quote is
   searched for in the PDF text: exact match first, then a ≥95% fuzzy match only across page breaks. A
   promise whose quote isn't found is dropped, and its page number comes from where it was found, not from
   the model. On one run this removed two quotes the model had invented.
2. **Executive careers (offline).** The same approach on appointment filings: each job or degree is kept only
   if its source sentence is in the PDF.
3. **Bull vs bear (live).** The model gets numbered evidence (reported quarters and management's quotes) and
   must cite evidence numbers for each sentence. Code then extracts every ₹, % and basis-point figure from
   each sentence and drops the sentence unless each figure appears in the evidence it cites, after
   rounding to the decimals shown.
4. **Company question box (live).** The same check, with the investor's question fenced in the prompt as
   data.
5. **Explain this filing (live, on request).** A Python function fetches the filing PDF from NSE's archive
   (only that host) and extracts its text page by page. The model returns 3–5 points and 1–3 "what it means
   for you" points, each with a verbatim quote and a page number. Code keeps a point only if its quote is on
   that page (ignoring the broken spacing PDF extraction produces) and its ₹, % and bps figures appear on that
   page. It is told not to predict prices or give advice. On test filings it surfaced an auditor's disclaimer
   buried on page 14 of a results filing.

On choosing models: Flash-Lite missed most promises on a test transcript, 3.8 Flash took 6–20 minutes per
transcript, and 3.6 Flash with 3.8 as fallback was the balance.

On cost:
- **Offline:** every call is cached by a hash of the model and prompt, so each document is read once.
- **Live:** an answer is stored in Postgres, keyed by company and a hash of the exact evidence and prompt
  version, and served to every visitor. A Postgres advisory lock lets only one request generate a given
  answer at a time, and a global daily cap bounds new generations.
- **Total:** ₹0, about 70 offline calls.
- **One slip:** a last-day run used Flash-Lite because a setting wasn't applied. I re-ran it on 3.6, except
  for a few profiles stopped by the rate limit, which are marked.

There are no agents. Each model call is a single step in a pipeline with fixed inputs and a validated
output; nothing plans, calls tools or acts for the investor. The daily refresh uses no model at all.

### Cloud

- **Web app (Next.js) and the three model routes run on Vercel.** Pages are prerendered, and the server-only
  keys stay off the phone.
- **The live read of an unseen ticker and the filing-PDF reader run as a Python function on Vercel.** It
  streams progress, sits in the same deployment, and works within a 90-second budget. The PDF reader only
  answers FINN's own server (it requires the server's secret).
- **The daily refresh runs on Vercel Cron**, once a day at 19:30 IST. The free plan allows one run a day,
  started within the hour. It calls a Deploy Hook to rebuild only when there is new data.
- **Private data, the answer cache, the call log and the fresh market data live in Supabase (Postgres with
  anonymous sign-in).** Row-level security is built in: market data is readable by anyone, investor data
  only by its owner. The free tier is enough.
- **The one-time history and the model extraction run as a batch job on my laptop, with the output
  committed.** They are heavy and the free model tier is unreliable, so the demo shouldn't depend on them
  at runtime.

## 4. What I deliberately left out

- **Intraday data and phone notifications.** The refresh is end-of-day, once a day. Promises, executive
  profiles and balance sheets from newly filed documents still need the laptop pipeline, because they use the
  model or a year of history.
- **Most promise checks.** Of 94 extracted promises (23 transcripts, 14 companies), 84 concern a business
  segment, capacity, a date or an amount, so 10 can be checked against reported totals today. Eight
  companies have no ledger because no transcript, or only a covering letter, was filed.
- **The annual report's narrative.** The financial statements come from the XBRL results filings instead.
- **BSE,** for the reasons above.
- **Price predictions.** FINN shows how the price moved after a filing and after earlier ones of the same
  type, labelled as history and not adjusted for the market. A forecast with no track record would look
  precise without being reliable.
- **My 150 KB JavaScript target.** The home screen is 255 KB, about 175 KB of it the framework.

## 5. Where I'd take it next

1. Check segment-level promises against the segment revenue I already parse, which would make most of the
   ledger checkable.
2. Extend the daily job to new transcripts and appointment filings, and send real notifications.
3. Read the annual report's narrative sections.
4. Add a results card for banks and lenders, where EBITDA doesn't apply.

Testing: 97 automated tests (Python and TypeScript), run by hand, plus a row-level-security test against
the live database.

I built FINN with Claude Code as a coding assistant; the build history shows how I broke the work down,
directed it, and corrected it. Every number in the app comes from NSE filings or market prices; the network
is synthetic.

Thank you for an interesting problem.

Anurag Aggarwal
2023MT10312
