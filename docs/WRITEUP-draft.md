<!--
DRAFT for the covering email, in your voice. It follows the brief's list: what you built, key decisions and
trade-offs, architecture (data pipelines, security & privacy, LLMs and agents, cloud), what you left out,
and where you'd take it next. Read it once as yourself and change anything you wouldn't say in an interview.
Facts match the README and the live app as of 15 Nov 2026.
-->

**To:** assessment@enam.com
**Subject:** IIT Delhi – Founding AI Engineer - 2027

Hello,

Here's my submission for the FINN challenge.

- **Prototype (best on a phone):** https://assignment1-eta-dun.vercel.app, no login needed
- **Code:** https://github.com/agarwal777/ASSIGNMENT1
- **AI build history:** https://gist.github.com/agarwal777/c12e2899ac714be0e69f44e40fc3420c

### What I built

An investor doesn't need more news about a company they own. They need to know whether the reason they
bought it still holds, and if not, what to ask and who to ask. So FINN is built around that reason, the
thesis, rather than a feed.

- **Push** is a morning brief over real NSE filings for an 18-company portfolio, and it ends. At most five
  items "need you"; the rest are folded and counted. A results card opens with a verdict worked out from
  the filing ("Margin up 172 bps YoY with revenue up 15.3%") and shows Revenue, EBITDA, PBT and PAT against
  last quarter and last year. You set the time window, what counts as an unusual price or volume move, and
  which kinds of announcement matter to you.
- **The Network** shows up inside Push. When Voltas named Jayant Balan as MD, the card read his career
  from the appointment filing and found that Rohan, one of your contacts, worked with him at Voltbek from
  2019 to 2022. One tap gives a call sheet: why Rohan, when you last spoke, three questions and a draft
  message you send yourself. You can also ask your network directly, by person, company or theme.
- **Pull** is the company page. Its centre is a promise ledger: what management said on earnings calls,
  checked against what they later reported. Aurobindo guided a 20–21% EBITDA margin for FY26 and delivered
  20.23% (Met); its FY27 goal of "north of 21%" is behind at 20.79%. Around that sit the balance sheet and
  cash flow, a year of prices with filings marked, a cited bull-vs-bear, and a question box that answers
  only from the company's own filings. Any NSE ticker works through Ask in two or three seconds.

### Key decisions and trade-offs

- **A snapshot, not a live feed.** Exchange sites block scripts and the free model tier is unreliable, and a
  demo that doesn't run is the worst outcome. So FINN replays 31 Oct–14 Nov 2026 from committed data. It
  can't break during a demo; the cost is that it doesn't watch the market, and there are no phone
  notifications yet.
- **Finite over complete.** Five cards and a clear end, instead of every filing in a list. The ranking will
  sometimes be wrong. When I labelled 40 filings blind, FINN's precision on what it chose to show was 0.54,
  so the folded items stay one tap away and you can override the ranking in Settings.
- **Numbers from filings, never from a model.** Results are parsed straight from XBRL; on Lupin and
  Aurobindo the parser matched the companies' own PDFs on all 8 lines. Scores, statuses and network links
  are formulas with their reasons shown. It's slower to build than asking a model, but nothing on screen is
  a guess.
- **Sourced links or none.** A peer is a company in the same NSE industry. Supplier links come only from
  related-party filings (M&M's lists 46 suppliers and 37 customers, all group companies). A network link
  with no dates in the filing is shown as "probable".
- **Speed over bundle size.** I keep the brief's data in the browser so changing the date or your settings
  re-ranks instantly. That puts the home screen at 255 KB of JavaScript, over my own 150 KB target.

### Architecture

```
 LAPTOP (batch)                       VERCEL                            PHONE
 NSE filings, XBRL, prices,   ──►     Next.js app reads JSON      ◄──►  browser: network matching,
 transcripts → Python workers         2 model routes ──► Gemini         re-ranking with your settings
 (+ cached Gemini) → JSON             Python fn ──► NSE (live)
                                              │                              │
                                              ▼                              ▼
                               SUPABASE: your private rows (own rows only) + shared answer cache
```

**Data pipelines.** Python workers on my laptop pull NSE announcements, the XBRL results filings, a year of
prices and the NSE-filed call transcripts. They classify filings with rules into ENAM's 17 categories,
parse the financials, and write JSON that's committed with the app. A name in a filing is linked to a
contact by cleaned-up employer names and overlapping dates. NSE only: BSE's feed blocks scripts and its data
is paid. I checked one week by hand for three companies, and all 23 BSE announcements were on NSE too.

**Security and privacy.** Contacts are stored per user behind row-level security; I tested it with two
accounts trying to read and change each other's data. All network matching happens in the browser. No
model ever sees a contact: a filter blocks network fields before any call, and the question box won't
accept a question that names one of your contacts. The demo uses anonymous accounts and a synthetic
network, deleted on "Reset demo". For real use I'd add proper sign-in, encrypted contact fields, a consent
step for imported contacts under India's data protection law, and deletion that removes everything derived
from a contact.

**LLMs and agents.** A model is used in four places, and each is checked in code, not just in the prompt:
- **Finding promises in transcripts** and **reading new executives' careers** from their filings. Anything
  returned must appear word for word in the PDF, or it's dropped; on one run that threw out two made-up
  quotes.
- **Bull vs bear** and **the question box.** A sentence is kept only if it cites a source and every number
  in it appears in that source.

I used Gemini's free tier. Flash-Lite missed most promises, 3.8 Flash was too slow, and 3.6 Flash was the
balance. Each document is read once and cached, and live answers are stored once and shared by every
visitor under a daily cap. Spend was ₹0 for about 70 calls. One slip, said upfront: a last-day run used
Flash-Lite because a setting wasn't applied. I re-ran it, apart from a few executive profiles stopped by the
rate limit, which are marked. There are no agents: nothing plans or acts on its own. FINN drafts; you
decide and send.

**Cloud.** The app and its two model routes run on Vercel, which keeps the server-only keys off the phone.
A small Python function there reads unseen tickers live from NSE. Supabase (Postgres with anonymous
sign-in) holds the private data and the shared answer cache. Ingestion stays on my laptop because the
sources are too unreliable for the demo to depend on.

### What I left out

- **Phone notifications and a daily refresh.** Push happens when you open the app.
- **Most promises can't be checked yet:** 84 of 94 are about a segment, a capacity or a date. The ones added
  on the last day are checked by code, not yet by hand.
- **The annual report's narrative.** The statements come from the results filings, which carry the same
  audited numbers.
- **BSE,** for the reasons above.

### Where I'd take it next

Check segment promises against the segment figures I already parse, which would make most of the ledger
checkable. Then run the pipeline daily with real notifications, read the annual report's narrative, and
add a results card that makes sense for banks.

I built this with Claude Code as my coding assistant; the build history shows how I directed it, where I
pushed back, and what I changed. Every number in the app comes from NSE filings or market prices, and the
network is made up.

Thanks for a genuinely interesting problem.

Anurag Aggarwal
2023MT10312
