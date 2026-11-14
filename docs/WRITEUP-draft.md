<!--
DRAFT for the covering email. Rewrite it in your own words before sending; it is a structured
starting point, not a finished letter. Facts below match the README and the live app as of the last
commit, including the final ledger extraction run.

Before sending, check yourself:
- Recipient and subject line exactly as the brief states. The brief's subject reads
  "IIT Delhi – Founding AI Engineer - 2027"; confirm with ENAM whether that applies to you.
- Links: live app, public repo, and your exported AI build history.
- Venue/employer policy on disclosing AI assistance (the build history covers this).
-->

**Subject:** (as specified in the brief)

Hello,

Please find my submission for the FINN build challenge.

- **Live prototype (phone):** https://assignment1-eta-dun.vercel.app — no login
- **Repository:** https://github.com/agarwal777/ASSIGNMENT1
- **AI build history:** [link to exported sessions]

**What I built**

FINN treats the investor's reason for owning a stock as the central object. Push, Pull and the Network
all answer one question: is the thesis still true, and if not, what should I ask and whom?

- **Push:** a finite morning brief replaying real NSE filings (6–7 Nov 2026). At most five cards; each
  leads with a verdict computed from the numbers, shows Revenue / EBITDA / PBT / PAT QoQ and YoY parsed
  from the XBRL filing, and ends with one person and one question. Routine filings are folded and counted.
- **Network inside Push:** Voltas named Jayant Balan as MD. The card shows his career from the filing's
  own brief profile and the path You → Rohan M. → Jayant Balan (overlapped at Voltbek, 2019–22), with a
  call sheet: why him, three questions, a draft opener.
- **Pull:** a Promise Ledger from earnings-call transcripts. Example: Aurobindo guided a 20–21% FY26
  EBITDA margin and delivered 20.23% (four reported quarters); its FY27 "north of 21%" target is at risk
  at 20.79% year to date. Every quote is verified word for word against the PDF.
- **Any ticker:** Ask processes a company I didn't pick (e.g. Dixon, Havells) live from NSE in 2–3 s.

**Key decisions and trade-offs**

1. Numbers never come from a model. XBRL + Python, cross-checked against the companies' own result
   PDFs (Lupin 8/8, Aurobindo 8/8 line items). Headlines are templates over those numbers.
2. One model step only: finding promises in transcripts, one cached call per transcript, with quotes
   verified against the source. Everything else is rules and formulas with stated reasons.
3. The network never leaves the investor: Supabase row-level security (tested), matching in the
   browser, and an LLM router that refuses network fields.
4. Snapshot first: the demo replays committed data, so it works even when NSE or the model is down.

**Architecture** (diagram in the README)

- Pipelines: laptop workers pull NSE announcements, XBRL results, prices and NSE-filed transcripts;
  outputs are committed as JSON; the app reads them (prerendered server pages).
- Security & privacy: RLS per user, anonymous demo users, synthetic contacts, no model sees the network;
  encryption and consent flows are designed but not built.
- LLMs: Gemini free tier. Flash-Lite was too weak on the first transcript; 3.8 Flash too slow; 3.6 Flash
  with 3.8 fallback. Spend ₹0; 12 live calls, about 194k input and 10k output tokens.
- Cloud: Next.js and a Python function on Vercel; Supabase for the private vault.

**What I left out, honestly**

- Ledger covers 9 of 12 transcripts (free-tier quota); 26 of its 30 promises are segment-level or
  non-financial and shown as "can't check yet" until segment parsing exists.
- Bull vs bear, the free-text agent and the thesis editor are not built.
- The status rule is a strict range check and ignores qualifiers like "higher side of".
- The 150 KB JS target isn't met: the framework alone is ~152 KB.

**Next:** segment-level XBRL parsing, a lender results card, thesis editing with evidence re-check, and
scheduled ingestion from an Indian-region runner.

Thank you for the interesting problem.

[Your name]
