<!--
DRAFT for the covering email. Rewrite it in your own words before sending; it is a structured
starting point, not a finished letter. Facts below match the README and the live app as of 15 Nov 2026.

Before sending, check yourself:
- Recipient and subject line exactly as the brief states. The brief's subject reads
  "IIT Delhi – Founding AI Engineer - 2027"; confirm with ENAM whether that applies to you.
- Links: live app, public repo (confirm it is public), and your exported AI build history
  (the brief requires it; the line below is still a placeholder).
- Venue/employer policy on disclosing AI assistance (the build history covers this).
- Migrations 0004 and 0005 have been run in Supabase, so every Settings control works on the live link.
-->

**Subject:** (as specified in the brief)

Hello,

Please find my submission for the FINN build challenge.

- **Live prototype (phone):** https://assignment1-eta-dun.vercel.app — no login
- **Repository:** https://github.com/agarwal777/ASSIGNMENT1
- **AI build history:** [ADD BEFORE SENDING: link to exported Claude Code sessions]

**What I built**

FINN treats the investor's reason for owning a stock as the central object. Push, Pull and the Network
all answer one question: is the thesis still true, and if not, what should I ask and whom?

- **Push:** a finite morning brief over real NSE filings (any day 1–15 Nov 2026, window 24 h, 7 days
  or custom). At most five cards; each leads with a verdict computed from the numbers, shows Revenue /
  EBITDA / PBT / PAT QoQ and YoY parsed from the XBRL filing, and ends with one person and one question.
  Routine filings are folded and counted. The investor sets what "unusual" means (volume ×, ± % in a day)
  and, per announcement type, Alert / As scored / Mute.
- **Network inside Push:** Voltas named Jayant Balan as MD. The card shows his career from the filing's
  own brief profile and the path You → Rohan M. → Jayant Balan (overlapped at Voltbek, 2019–22), with a
  call sheet: why him, three questions, a draft opener.
- **Pull:** a Promise Ledger from earnings-call transcripts. Example: Aurobindo guided a 20–21% FY26
  EBITDA margin and delivered 20.23% (four reported quarters, Met); its FY27 "north of 21%" target is
  Behind at 20.79% year to date. Every quote is verified word for word against the PDF. The Company page
  adds the balance sheet, cash flow and segment mix from the annual and half-year XBRL filings, quarter charts, a year of prices with filings and alerts marked, a cited bull vs bear, and a
  question box that answers only from that company's primary sources.
- **Portfolio:** search by name, symbol or sector; filter and sort by the latest quarter's EBITDA margin,
  revenue growth YoY or margin change.
- **Any ticker:** Ask processes a company I didn't pick (e.g. Dixon, Polycab) live from NSE in 2–3 s.
- **Network, directly:** "Who knows…" ranks contacts for a person, an organisation or a theme, with an
  expertise map of the whole network; each name opens a call sheet. Appointees' careers are read from their
  appointment filings, so a new director at Tata Power links to a contact who worked there.

**Key decisions and trade-offs**

1. Numbers never come from a model. XBRL + Python, cross-checked against the companies' own result
   PDFs (Lupin 8/8, Aurobindo 8/8 line items). Headlines are templates over those numbers.
2. Four model steps, each with a guard: finding promises in transcripts and reading appointees' careers
   from their filings (offline, cached, every quote verified against the PDF); bull vs bear and the company question (live), where a
   sentence is kept only if it cites numbered primary-source evidence and every figure in it appears in
   that evidence. Everything else is rules and formulas with stated reasons.
3. The network never leaves the investor: Supabase row-level security (tested), matching in the browser,
   a deny-list that refuses network fields before any model call, and a question box that refuses a
   question naming a contact.
4. Snapshot first: the brief and company pages replay committed data, so they work even when NSE or the
   model is down. The live model features are cached per company (and per question) and share a daily cap.

**Architecture** (diagram in the README)

- Pipelines: laptop workers pull NSE announcements, XBRL results, prices and NSE-filed transcripts;
  outputs are committed as JSON; the app reads them. A name in a filing is linked to a contact by
  canonical employer name and overlapping dates, with a strength formula and "probable" when dates are missing.
- Security & privacy: RLS per user, anonymous demo users, synthetic contacts, no model sees the network.
  Retention today: until the visitor resets the demo. For real use: contacts kept until the investor
  deletes them (cascading), a consent step for imported contacts, encryption of contact fields, named accounts.
- LLMs: Gemini free tier. Flash-Lite was too weak on the first transcript, 3.8 Flash too slow; 3.6 Flash
  with 3.8 fallback. Spend ₹0; 12 live extraction calls, about 194k input and 10k output tokens; live
  generations are cached, capped, and logged when they succeed.
- Cloud: Next.js, its API routes and a Python function on Vercel; Supabase for private rows and the answer
  cache; Gemini called from the laptop and from the API routes.

**What I left out, honestly**

- The annual report's narrative (MD&A, notes) isn't read; its financial statements come from the XBRL
  results filings instead.
- The Ledger covers 3 companies (9 of 12 transcripts, free-tier quota); 26 of its 30 promises are
  segment-level or non-financial and shown as "can't check yet" until segment parsing exists.
- Most appointment filings give no years, so links through new appointees are marked "probable"; no
  supplier links, because no source names a company's suppliers.
- No real push to the phone (no notifications or scheduled refresh).
- NSE only: BSE's feed blocks scripts and its data products are paid. A one-week check of 3 dual-listed
  companies found all 23 BSE announcements on NSE too; filings keep a source and a dedupe key for a second feed.
- The status rule is a strict range check and ignores qualifiers like "higher side of".
- The 150 KB JS target isn't met: the framework baseline alone is ~175 KB; Today is 255 KB.

**Next:** the annual report's narrative, checking segment promises against the segment figures now parsed,
a lender results card, and scheduled ingestion with notifications from an Indian-region runner.

Thank you for the interesting problem.

[Your name]
