# ENAM brief — requirement list (for drift checks)

Paraphrased from "FINN: Financial Investment Agent — Founding AI Engineer Build Challenge" (released
8 Nov 2026, deadline 15 Nov 2026) and its companion "Reference: Announcement Categories & Financial
Glossary". The brief says its frontend items are "illustrations, not a checklist" and grades
"creativity, product sense, judgment, and architecture — not completeness". Each item is marked:
**MUST** (the brief requires it), **ASKED** (asked for directly, e.g. "make it configurable"), or
**MENU** (an example or option the brief offers; leaving it out is a choice to explain, not a defect).

## A. Push

- A1 MUST — Push: the app proactively tells the investor what changed and why they should care.
- A2 ASKED — Windowed digest: a window the investor chooses (default last 24 h, but they can pick the
  period); every corporate filing/announcement across the portfolio in it, filtered and prioritised so
  what matters is first and routine items are collapsed or hidden.
- A3 ASKED — Triggered alerts when something crosses a threshold: (a) a material announcement of a type
  the investor cares about (results, M&A, management change, …); (b) an unusual end-of-day move, e.g.
  volume > ~2× recent average or price move beyond ±X% in a day. Thresholds configurable by the investor.
- A3c ASKED (implied by A3a) — the investor chooses which announcement types they care about.
- A4 MENU — Management change: a short background/bio of the incoming person (e.g. from LinkedIn) and
  whether anyone in the network worked with them, studied with them, or is one connection away.
- A5 MENU — Quarterly results: from the actual results filing, Revenue, EBITDA, PBT and PAT, this
  quarter vs last quarter (QoQ) and vs the same quarter a year ago (YoY).
- A6 MENU — Material event (M&A, large capex, litigation) at a company the investor knows people at:
  point to the best-placed person in the network, and why.
- A7 ASKED — Every other announcement type: decide what earns attention (a one-line summary next to the
  filing, or just the filing at the right priority).
- A8 MENU — Categories from the reference (results, M&A, fund_raise, management_change, litigation,
  insider_trading, earnings_call, investor_meetings, credit_rating, dividend, bonus_split, capex,
  press_release, postal_ballot, agm_egm, pledging, unclassified): use, adapt or ignore.

## B. Pull

- B1 MUST — Pull: on-demand research/analysis of a company, grounded in fundamentals (annual reports +
  concall transcripts).
- B2 MUST — Generalise: works on any NSE ticker where the data is available, not hard-wired to the demo set.
- B3 ASKED — A handful (3–5) of ad-hoc research companies, possibly outside the portfolio, to demo Pull.
- B4 MENU — Eight outputs: business snapshot (what it does, segments, revenue mix); financial snapshot
  (revenue, margins, PAT, key ratios); trajectory (multi-year direction); balance sheet (debt, leverage,
  working-capital cycle, funding); cash quality (cash-flow trend, cash conversion); narrative vs numbers;
  guidance (growth, margins, capex); bull vs bear.
- B5 ASKED ("what we value most") — Worked example: last four quarters, management's headline guidance
  and growth commentary vs what was delivered (promised vs delivered).
- B6 MUST — Pull uses primary sources only (annual reports + transcripts); no broker notes, news,
  research reports, or the model's outside knowledge.

## C. Network

- C1 MUST — Network layer built on the investor's own network; woven into Push and/or Pull at the
  moments it matters (not bolted on), and can be queried directly.
- C2 ASKED — Decide what the investor gives FINN as a starting point; build a mock network that overlaps
  with portfolio and research companies.
- C3 ASKED — Network profiles: roles, employers, education, tenure — for people in the network and for
  people who appear in filings (e.g. an incoming CFO); say in the writeup whether real, public dataset or
  synthetic, and how it would be done for real.
- C4 MENU — Who should I call: who has worked at the company, a competitor, a supplier or a customer,
  and what would they know.
- C5 MENU — Second-degree reach: who knows the new MD, and how strong that link is.
- C6 MENU — Diligence on people: career path of a promoter/management team, overlaps with the network,
  and anything worth asking about.
- C7 MENU — Expertise map: go-to people for a theme (e.g. specialty chemicals, rural lending, semiconductors).
- C8 MENU — Keeping the network warm: haven't spoken in a while, and their former employer just announced
  results or a deal.
- C9 ASKED — "Show us what it notices that the investor wouldn't."

## D. Data sources (backend)

- D1 MUST — End-of-day price and volume for the portfolio (e.g. yfinance, .NS/.BO).
- D2 MUST — Corporate announcements/filings from NSE/BSE for those stocks.
- D3 MUST — Company fundamentals: annual reports and concall transcripts (screener.in or the company's
  investor-relations site).
- D4 MUST — Network profiles (see C3).
- D5 ASKED — Portfolio of 15–20 NSE/BSE-listed companies, mixed sectors and sizes.

## E. Product, interaction, design

- E1 MUST — Mobile-first working prototype, easy to try on a phone.
- E2 ASKED — Experiment with the interaction model (chat, voice, copilot, dashboard, network map, or
  something new); show a point of view, not only data.
- E3 ASKED — "No AI slop": core, concise, beautifully presented, interactive; density and design count.
- E4 MUST — All three layers present, each with at least one working workflow.

## F. Architecture, cost, submission

- F1 MUST (writeup) — Data pipelines: how market data, filings, fundamentals and profiles are fetched,
  refreshed, stored and linked (e.g. matching a name in a filing to a person in the network).
- F2 MUST (writeup) — Security & privacy: how the network stays private, what personal data is stored and
  for how long, consent and access control in a real deployment.
- F3 MUST (writeup) — LLMs and agents: which steps use a model, which model and why, where agents plan,
  call tools or act on their own.
- F4 MUST (writeup) — Cloud services: what runs where, and why. A simple diagram is welcome.
- F5 ASKED (bonus) — Cost efficiency: model routing, caching, chunking.
- F6 MUST — Submit: deployed prototype link; public GitHub repository; AI build history (coding-agent and
  LLM session exports/links); a short writeup in the covering email covering what was built, key decisions
  and tradeoffs, architecture choices, what was deliberately left out, and where it goes next.
