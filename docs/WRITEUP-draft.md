<!--
DRAFT for the covering email. It is written in the first person so it reads like a note from you, but it
is a draft: change anything that isn't how you would say it, and cut what you wouldn't defend in an
interview. Facts match the README and the live app as of 15 Nov 2026.

Before sending:
- Subject line exactly as the brief states ("IIT Delhi – Founding AI Engineer - 2027"); confirm with ENAM
  if that doesn't match your institute.
- Add your exported AI build history link (the brief requires it; the line below is a placeholder).
- Your institute's / ENAM's policy on disclosing AI assistance: the last paragraph and the build history cover it.
-->

**Subject:** (as specified in the brief)

Hello,

Here is my submission for the FINN build challenge.

- **Prototype (open it on a phone):** https://assignment1-eta-dun.vercel.app (no login)
- **Repository:** https://github.com/agarwal777/ASSIGNMENT1
- **AI build history:** [ADD BEFORE SENDING: link to exported Claude Code sessions]

### What I built, and the idea behind it

I started from one observation: an investor doesn't really want more news about a company they own. They
want to know whether the reason they bought it still holds, and if it doesn't, what to ask and who to ask.
So FINN is built around that reason, the thesis, rather than around a feed. Push, Pull and the Network are
three ways of answering the same question.

**Push** is a morning brief over real NSE filings for an 18-company portfolio. It ends. At most five cards
"need you", and everything else is folded and counted, with an estimate of the reading time it saved you.
A results card leads with a verdict computed from the filing ("Margin up 172 bps YoY with revenue up
15.3%") and shows Revenue, EBITDA, PBT and PAT against last quarter and last year, parsed from the
company's XBRL results filing. You choose the window (24 hours, 7 days or a custom start date), what counts
as an unusual move (volume multiple, price move), and how much each announcement type matters to you
(Alert, As scored, Mute).

**The Network lives inside Push rather than beside it.** When Voltas named Jayant Balan as its next MD,
the card shows his career from the appointment filing and the path You → Rohan M. → Jayant Balan: they
overlapped at Voltbek Home Appliances from 2019 to 2022. Tap Rohan and you get a call sheet with why him,
when you last spoke, three questions and a draft opener that you send yourself.

**Pull** is the Company page, and its centre is a Promise Ledger: what management said on earnings calls,
checked against what the company then reported. Aurobindo's CFO guided a 20–21% EBITDA margin for FY26 and
the four reported quarters came to 20.23%, so it shows Met. Its FY27 target of "north of 21%" is Behind at
20.79% so far. Lupin guided 24–25% and is at 27.9%, so it shows On track, above the guided range. Every
quote is checked word for word against the transcript PDF. The page also has the balance sheet, cash flow
and segment mix from the annual and half-year filings, a year of prices with filings marked on it, a cited
bull-vs-bear, and a question box that answers only from that company's own filings. Any NSE ticker works
through Ask: I tried Dixon and Polycab, which aren't in my portfolio, and each took 2–3 seconds.

You can also ask the Network directly. "Who knows…" takes a person, a company or a theme ("specialty
chemicals"), and an expertise map shows what your network covers.

### The decisions that shaped it

**1. A committed snapshot, not a live feed.** Exchange sites throttle and block scripts, and the free model
tier fails often. A demo that doesn't run was the outcome the brief warned against most, so all public data
is fetched and processed in batch on my laptop and committed as JSON. The app mostly reads files. The cost
is that FINN replays the first half of November 2026 rather than watching the market, and "push" happens
when you open the app, not as a phone notification. I'd change that first in a real version: a small
scheduled job in an Indian region would run the same pipeline daily.

**2. Numbers come from filings and code, never from a model.** Revenue, EBITDA, margins, growth, alert
scores, network link strengths and promise statuses are all rules and formulas, each with its reason
shown. I checked the parser against the companies' own results PDFs (Lupin and Aurobindo 8 of 8 line items
each). A model is used in four places, and each has a guard written in code rather than a request in the
prompt:
- finding promises in transcripts, kept only if the quote is found in the PDF;
- reading an appointee's career from their filing, under the same rule;
- writing bull vs bear, where a sentence survives only if it cites numbered evidence and every rupee,
  percentage and basis-point figure in it appears in what it cites;
- the question box, under the same rule.

These guards are not hypothetical: on one extraction run they threw out two quotes that the model had
written but that weren't in the transcript.

**3. The network never leaves the investor.** Contacts sit in Supabase behind row-level security, so each
user can read only their own rows; I tested this with two users trying to read, change and delete each
other's data. Matching runs in the browser. Explanations, questions and openers are templates, not model
output. Before any model call, a deny-list refuses anything containing a network field, and the question
box refuses a question that names one of your contacts. For the demo, each visitor gets an anonymous
account and a copy of a synthetic network, and "Reset demo" deletes it. In a real deployment I'd add named
accounts, encryption of contact fields, a consent step for imported contacts under India's data
protection law, and deletion that cascades from a contact to everything derived from it.

**4. Links between people and companies have to be sourced.** A name in a filing is matched to a contact
through cleaned-up employer names and overlapping dates, with a strength score. When a filing gives no
dates, the link is marked "probable" rather than guessed. "Peer" means the same industry in NSE's own
classification, which I read for 47 companies. A short list of competitors I picked myself is labelled
"our classification" wherever it shows. Supplier links appear only where a related-party filing names
them: M&M's lists 46 suppliers and 37 customers, all group companies. Nothing else is invented.

**5. A cheap model, and as few calls as possible.** I used Gemini's free tier. Flash-Lite missed most
promises on the first transcript, 3.8 Flash was too slow, and 3.6 Flash, with 3.8 as a fallback, was the
balance. Every offline call is cached by content, so each document is read once. The two live features keep
one checked answer per company, or per company and question, shared by all visitors, under a daily cap.
Total spend was ₹0: 70 offline calls, about 960k input and 116k output tokens. One honest note: a run on
the last day used Flash-Lite by mistake because a setting wasn't applied. I re-ran it on 3.6, except for
some executive profiles the rate limit stopped, which are marked as such.

**6. Where things run.** The Next.js app and its two model routes run on Vercel, because the pages are
mostly prerendered and the server-only keys stay off the phone. A small Python function, also on Vercel,
reads an unseen ticker live from NSE. Supabase holds the private rows and the shared answer cache. There
are no autonomous agents: every model call is a single step in a pipeline I control, and FINN never acts on
your behalf. It drafts the opener; you send it.

### What I left out

- **The annual report's narrative.** The financial statements come from the XBRL results filings, which
  carry the same audited numbers, but the management discussion and the notes aren't read.
- **Most of the ledger can't be checked yet.** 84 of the 94 promises are about a segment, a capacity or a
  date, so 10 can be checked against reported numbers today. The 64 promises added on the last day are
  quote-checked but haven't had my field-by-field spot-check.
- **BSE isn't fetched.** Its feed blocks scripts and its data is paid. I compared one week for three
  companies by hand: all 23 BSE announcements were also on NSE.
- **No phone notifications**, as above.
- **The JavaScript budget.** Today loads 255 KB against my own 150 KB target, because Next.js and React
  alone take about 175 KB.

### Next

Check segment-level promises against the segment figures I already parse, which would make most of the
ledger checkable. Read the annual report's narrative. Run the pipeline daily and send real notifications.

I built this with Claude Code as a coding assistant; the build history above shows how I directed it, where
I pushed back, and what I changed. Every number in the app comes from NSE filings or end-of-day prices; the
network is synthetic.

Thank you for an interesting problem.

[Your name]
