<!--
DRAFT for the covering email. Written in the first person so it reads as your note; change anything that
isn't how you'd say it, and cut what you wouldn't defend in an interview. Facts match the README and the
live app as of 15 Nov 2026.

Before sending:
- To: assessment@enam.com · Subject: "IIT Delhi – Founding AI Engineer - 2027" (exactly as the brief states).
- Email clients may not render the tables; if yours doesn't, keep the text and point to README §4–§8,
  where the same tables and a rendered diagram live.
-->

**To:** assessment@enam.com
**Subject:** IIT Delhi – Founding AI Engineer - 2027

Hello,

Here is my submission for the FINN build challenge.

- **Prototype (best opened on a phone):** https://assignment1-eta-dun.vercel.app (no login needed)
- **Repository:** https://github.com/agarwal777/ASSIGNMENT1
- **AI build history:** https://gist.github.com/agarwal777/c12e2899ac714be0e69f44e40fc3420c

The README has a two-minute walkthrough. Below I explain what I built, why it is shaped the way it is,
how it works underneath, and what I left out.

---

## 1. The idea

An investor doesn't need more news about a company they own. They need to know whether the reason they
bought it still holds, and if it doesn't, what to ask and who to ask. Almost everything in FINN follows from
taking that seriously. The central object is the thesis, made of the investor's own assumptions plus the
promises management has made, rather than a feed. Push, Pull and the Network are three ways of answering
one question: *is the thesis still true, and if not, what should I ask and whom?*

Three design rules came out of that:

- **Finite, not infinite.** A morning brief that ends. At most five items "need you"; everything else is
  folded and counted.
- **Verdict first, evidence one tap away.** Every number on screen opens its source (the exact XBRL fact
  or the transcript page) or its formula. Each block carries a tag: Said, Extracted, Calculated,
  FINN's read, Unknown.
- **People where they help.** There is no Network tab. A person and a reason sit at the bottom of each
  card and each company page, because that is the moment you'd think of calling someone.

## 2. What I built

**Portfolio and data.** I chose 18 NSE-listed, non-financial companies across autos, pharma, healthcare,
capital goods, defence shipbuilding, power, construction, chemicals, consumer, IT and metals. They were
picked because they all reported July–September results in the same two weeks, which makes the replay
interesting. I left lenders out because EBITDA doesn't mean much for banks. Four research companies
(Titan, Astral, Bharat Forge, PI Industries) sit outside the portfolio, and any NSE ticker works through
Ask. The snapshot covers 31 Oct to 14 Nov 2026: 11,147 NSE announcements (251 for the portfolio), a year
of daily prices, and Q2 FY27 results for 21 of the 22 companies, parsed from their XBRL filings.

**Push: the morning brief.** Today opens on the latest brief, and a date strip replays any day from 1 to
15 Nov.
- **Ranking.** Each filing is classified into ENAM's 17 categories by rules, scored, and placed in
  "Needs you" (at most 5), "Worth a read" (one line each) or a folded routine group.
- **Results cards.** These lead with a verdict computed from the numbers ("Margin up 172 bps YoY with
  revenue up 15.3%"), then Revenue, EBITDA, PBT and PAT against last quarter and last year, and a
  five-quarter margin trend.
- **Unusual moves.** Price and volume moves are flagged against thresholds the investor sets (default:
  volume above 2× its 20-day average, or a price move beyond ±5%). A move with no filing since the
  previous session is marked "unexplained".
- **Your settings.** The investor chooses the window (24 h, 7 days or from any start date), and, per
  announcement type, Alert, As scored or Mute. Everything is saved to their own row.

**Network inside Push.** When Voltas named Jayant Balan as its next MD, the card shows his career, read
from the appointment filing's own brief profile. It also shows the path You → Rohan M. → Jayant Balan:
Rohan and Balan overlapped at Voltbek Home Appliances from 2019 to 2022. Tapping Rohan opens a call sheet
with why him, when you last spoke, three questions and a draft opener, which you send yourself. Careers
are read from every appointment filing in the snapshot, not just this one: 16 appointees, 8 of whom have a
career in their filing.

**Pull: the Company page.** Its centre is a **Promise Ledger**: what management said on earnings calls,
checked against what the company then reported.
- **Aurobindo:** the CFO guided a 20–21% EBITDA margin for FY26, and the four reported quarters came to
  20.23%, so it shows **Met**. The FY27 target of "north of 21%" is **Behind** at 20.79% year to date.
- **Lupin:** guided 24–25% and is at 27.9%, so it shows **On track, above the guided range**.

The ledger holds 94 promises from 23 transcripts across 14 companies, and every quote has been found word
for word in the transcript PDF. Around it, the page has:
- your own editable assumption, re-checked as you change it;
- the balance sheet, cash flow and revenue mix by segment, from the annual and half-year filings;
- a year of prices with results, calls and FINN's alerts marked;
- quarter charts;
- people to ask;
- a cited bull-vs-bear;
- a question box that answers only from that company's own filings.

**Pull, any company.** Ask searches 2,635 NSE symbols. A company I didn't pick is read live from NSE: a
year of prices and recent quarters of results, charted, in about 2–3 seconds (Dixon 2.7 s, Polycab 2.3 s).

**Portfolio.** Add or remove companies, from all 22 FINN holds data for or any NSE symbol as a live view.
Search by name or sector, and screen by the latest quarter's EBITDA margin, revenue growth or margin
change.

**Network, directly.** "Who knows…" takes a person, a company or a theme ("specialty chemicals"). With an
empty box it shows an expertise map of what your network covers.

## 3. Architecture

```
            LAPTOP  (batch, cached, committed)                    VERCEL                         PHONE
 ┌──────────────────────────────────────────────┐     ┌──────────────────────────────┐
 │ NSE announcements ─┐                          │     │ Next.js app                  │   reads    ┌────────┐
 │ NSE XBRL results ──┼─► Python workers ─► JSON ├────►│  (prerendered pages)         │◄──────────►│ Browser│
 │ Prices (yfinance) ─┤    rules · parsers ·      │     │ API routes: bull vs bear,    │            │  · network matching
 │ NSE transcripts ───┤    formulas               │     │  company question ─────────► Gemini      │  · re-ranking with
 │ Appointment PDFs ──┘    Gemini (cached) for    │     │ Python function: unseen      │            │    your settings
 │                         promises & careers    │     │  ticker ──────────► NSE live  │            └───┬────┘
 └──────────────────────────────────────────────┘     └──────────────┬───────────────┘                │
                                                                     │ service key (server only)      │ own rows only (RLS)
                                                         ┌───────────▼────────────────────────────────▼───────┐
                                                         │ SUPABASE  Postgres + anonymous auth                │
                                                         │  private rows: contacts, settings, assumptions     │
                                                         │  server-only: answer cache, daily cap, call log    │
                                                         └────────────────────────────────────────────────────┘
```

### The decisions that shaped it

**1. A committed snapshot rather than a live feed.** Exchange sites throttle and block scripts, and the
free model tier fails often. The brief says a demo that doesn't run is the worst outcome, so all public
data is fetched and processed in batch on my laptop and committed as JSON, and the app mostly reads files.
Three things follow:
- The demo works even when NSE or the model is down.
- Pages are fast and cheap to serve.
- The cost: FINN replays the first half of November rather than watching the market, and "push" happens
  when you open the app rather than as a notification.

Two features are deliberately live: Ask for an unseen ticker, and the two model features. Each degrades to
a reduced view or a plain message if its source fails.

**2. Numbers come from filings and code, never from a model.** The quarter numbers are parsed from
XBRL with no model involved.
- **Checked by hand:** I compared the parser with the companies' own results PDFs: Lupin and Aurobindo 8 of
  8 line items each, M&M and Tata Power 6 of 7.
- **Refusing rather than guessing:** units are read from each filing, and a figure that isn't in rupees is
  refused rather than scaled by a guess.
- **EBITDA definition (shown in the app):** profit before exceptional items and tax, plus finance costs and
  depreciation, minus other income (and minus the share of associates when it sits inside profit before
  tax, which is decided per filing by arithmetic). Starting before exceptional items removes one-offs
  without guessing their sign.
- **No hidden judgement:** filing categories, triage scores, network link strengths and promise statuses
  are all rules and formulas, each with its reason on screen.

**3. A model only where language is the problem, and every use guarded in code.**

| Step | Where | Model | Why a model | The guard (in code, not in the prompt) |
|---|---|---|---|---|
| Find management's promises in a transcript | Offline | Gemini 3.6 Flash (3.8 fallback) | Guidance is phrased a hundred ways | Kept only if the quote is found word for word in the PDF; the page is taken from where it's found |
| Read an appointee's career from their filing | Offline | Gemini 3.6 Flash; some 3.5 Flash-Lite (see §6) | Profiles are free text | Each stint kept only if its sentence is in the PDF |
| Bull vs bear | Live | Gemini Flash (3.6 by default, 3.8 fallback) | Needs a balanced argument | A sentence survives only if it cites numbered evidence and every ₹, % and bps figure in it appears in what it cites |
| "Ask about this company" | Live | Gemini Flash (3.6 by default, 3.8 fallback) | The investor's own question | Same check; the question is fenced in the prompt as data; a question the sources can't answer gets no answer |

These guards have already caught real errors: on one run they threw out two quotes the model had written
that weren't in the transcript.
- **No agents, on purpose.** Each model call is one step in a pipeline I control. Nothing plans, calls
  tools or acts on the investor's behalf. FINN drafts the opener; the investor sends it.
- **Promise statuses are a rule, not a judgement.** Margin and growth are higher-is-better, so at or above
  the bottom of the guided range means delivered or on track. A target stated as an amount (₹ crore,
  US$, "1.2x") is never judged as a percentage.

**4. The network never leaves the investor.**

| Concern | What exists | What a real deployment would add |
|---|---|---|
| Isolation | Row-level security on every private table: a user can read only their own rows. Tested with two users trying to read, insert, update and delete each other's data; all blocked | The same, with named sign-in |
| Where matching runs | In the browser. Explanations, questions and openers are templates, never model output | — |
| What reaches a model | Never network data: a deny-list refuses any payload with a network field, and the question box refuses a question naming one of your contacts. Sent: public filings, transcripts, XBRL figures, prices, and your question | A paid model tier (the free tier may use inputs to improve Google's products, acceptable here only because nothing private is sent) |
| What's stored, for how long | Synthetic contacts (first name and initial), employers, roles, dates. Kept until the visitor presses "Reset demo" | Contacts kept until the investor deletes them, with deletion cascading to everything derived; encryption of contact fields; a consent step for imported contacts under India's data protection law |
| Keys | Model and database service keys only on the server, never in the browser | — |

**5. Links between people and companies have to be sourced, never invented.**
- **Contacts to filings.** A name in a filing is matched to a contact by cleaning up employer names (legal
  suffixes removed, an alias table) and checking overlapping dates. The strength combines years of
  overlap, matching function, company size and recency. With no dates, the link is "probable", not guessed.
- **Peers.** "Peer" means the same industry in NSE's own classification, which I read for 47 companies.
  The few competitors I picked myself are labelled "our classification" wherever they appear.
- **Suppliers.** Supplier and customer links appear only where a related-party filing names them. M&M's
  half-year filing lists 46 suppliers and 37 customers, all group companies; outside suppliers aren't
  disclosed, so none are shown.
- **BSE.** BSE's feed blocks scripts and its data is paid, so I compared it by hand. For three companies
  over one week, all 23 BSE announcements were also on NSE. Each filing carries its exchange and a dedupe
  key, so a second feed would be a data change, not a redesign.

**6. Cost: a cheap model, called as rarely as possible.**
- **Choosing the model.** Gemini 3.5 Flash-Lite missed most promises on the first transcript (1 weak one
  against 6 verified from 3.8 Flash). 3.8 Flash took 6–20 minutes per transcript. 3.6 Flash, with 3.8 as
  fallback, was the balance.
- **Caching.** Offline calls are cached by content, so a document is read once. Live answers are stored
  once per company (or per company and question) and shared by every visitor, a request already in progress
  is never started twice, and new generations share a daily cap.
- **Spend:** ₹0, on the free tier. 70 offline calls, about 960k input and 116k output tokens.
- **One honest note:** a run on the last day used Flash-Lite by mistake because a model setting wasn't
  applied. I caught it in the call log and re-ran on 3.6, except for some executive profiles the free tier's
  rate limit stopped; those keep their Flash-Lite extraction and are marked. Their quotes are still checked
  against the PDF.

**7. Where things run.**

| Part | Where | Why |
|---|---|---|
| Web app and its two model routes | Vercel | Prerendered pages; server-only keys stay off the phone |
| Live read of an unseen ticker | Vercel Python function | Same project, no idle sleep, 90-second budget |
| Private rows, answer cache, call log | Supabase (Postgres + anonymous auth) | Row-level security, free tier |
| Ingestion and offline extraction | My laptop, results committed | Exchange sites and the free tier are unreliable; the demo must not depend on them |

## 4. How I checked it

- **Triage.** I labelled 40 portfolio filings blind ("would I want this in front of me?") with FINN's verdict
  hidden. Shown items: precision 0.54, recall 0.67. The biggest disagreement was results: I marked the
  sampled results filings as not material, while FINN, following ENAM's reference, puts them first. With one
  labeller and 40 items, I read these as directional.
- **Promise extraction.** 20 of the first run's 30 promises were checked field by field: quote, target and
  unit 20 of 20, metric 18 of 20, deadline 16 of 20 strict. The 64 promises added later are quote-checked by
  code but haven't had this manual check yet.
- **Tests.** 53 Python and 33 Node tests, run by hand, plus a row-level-security test against the live
  database.

## 5. What I left out, and why

- **The annual report's narrative.** The financial statements come from the XBRL results filings, which carry
  the same audited numbers, but the management discussion and the notes aren't read.
- **Most of the ledger can't be checked yet.** 84 of the 94 promises are about a segment, a capacity or a
  date. 10 can be checked against reported numbers today: 1 Met, 6 On track, 3 Behind. For 8 companies there
  is no ledger at all, and the page says why: only a covering letter was filed, or no transcript at all.
- **No phone notifications or scheduled refresh,** as explained in §3.
- **BSE,** as explained in §3.
- **The JavaScript budget.** Today loads 255 KB against my own 150 KB target, because Next.js and React alone
  take about 175 KB. I kept the snapshot data in the browser so changing the date or your settings re-ranks
  instantly; that was a deliberate trade.

## 6. Next

1. Check segment-level promises against the segment figures I already parse. That would make most of the
   ledger checkable.
2. Run the pipeline daily from an Indian-region job and send real notifications.
3. Read the annual report's narrative.
4. Add a lender-specific results card (net interest income, pre-provision profit).

I built FINN with Claude Code as a coding assistant. The build history above shows how I broke the work down,
directed it, pushed back when it was wrong, and decided what to keep. Every number in the app comes from NSE
filings or end-of-day prices; the network is synthetic.

Thank you for an interesting problem.

Anurag Aggarwal
2023MT10312
