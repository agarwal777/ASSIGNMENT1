// Fictional fixtures for /dev/cards and for loading/empty/error states. NOT real companies or people.
// Numbers are round on purpose so nobody mistakes them for data. Real screens read real data via api.ts.
import type {
  CompanyPayload, DigestResponse, NumValue, PathResult, PortfolioRow, SourceRef, StreamEvent,
} from "@/lib/types";

const src = (label: string, publishedAt: string, page?: number): SourceRef =>
  ({ documentId: `fixture:${label.toLowerCase().replace(/\W+/g, "-")}`, label, publishedAt, page });
const cr = (value: number, s?: SourceRef): NumValue => ({ value, kind: "inr_cr", epistemic: "EXTRACTED", source: s });
const growth = (value: number, formula: string): NumValue => ({ value, kind: "pct", epistemic: "CALCULATED", formula });
const RESULTS = src("Acme Polymers: Q2 FY27 results (example)", "2026-11-05T14:30:00+05:30", 3);
const APPOINT = src("Northwind Appliances: appointment of CFO (example)", "2026-11-05T19:10:00+05:30", 2);

export const digestFixture: DigestResponse = {
  window: { from: "2026-11-05T08:00:00+05:30", to: "2026-11-06T08:00:00+05:30", replay: true },
  totals: { filings: 40, touched: 3 },
  readingEstimate: { minutes: 30, formula: "20 folded × 0.5 min + 13 one-liners × 1.5 min (assumed reading times)" },
  needsYou: [
    {
      variant: "results", id: "fx-acme-results", companySymbol: "ACMEPOLY", companyName: "Acme Polymers (example)",
      category: "results", at: RESULTS.publishedAt, score: 0.9,
      headline: "Margin slipped by 200 bps despite 10% revenue growth",
      reasons: ["EBITDA margin −200 bps YoY", "revenue +10.0% YoY"],
      period: "Q2FY27",
      metrics: [
        { metric: "revenue", value: cr(1000, RESULTS), qoq: growth(5, "(1,000 − 952.4) ÷ 952.4"), yoy: growth(10, "(1,000 − 909.1) ÷ 909.1") },
        { metric: "ebitda", value: cr(150, RESULTS), qoq: growth(-5, "(150 − 157.9) ÷ 157.9"), yoy: growth(-2.5, "(150 − 153.8) ÷ 153.8") },
        { metric: "ebitda_margin", value: { value: 15, kind: "pct", epistemic: "CALCULATED", formula: "EBITDA ÷ revenue = 150 ÷ 1,000" },
          yoy: { value: -200, kind: "bps", epistemic: "CALCULATED", formula: "15.0% − 17.0%" } },
        { metric: "pbt", value: cr(100, RESULTS), yoy: growth(-10, "(100 − 111.1) ÷ 111.1") },
        { metric: "pat", value: cr(75, RESULTS), yoy: growth(-10, "(75 − 83.3) ÷ 83.3") },
      ],
      promiseCheck: {
        promiseId: "fx-p1", guidedLow: 16, guidedHigh: 18, unit: "percent",
        actual: { value: 15, kind: "pct", epistemic: "CALCULATED", formula: "EBITDA ÷ revenue" },
        quote: src("Acme Polymers: Q1 FY27 call transcript (example)", "2026-08-10T18:00:00+05:30", 7),
      },
      assumption: { ref: { id: "fx-a1", text: "EBITDA margin stays at or above 16%", source: "investor", deadline: "FY27" },
        stance: "contradicts", status: "behind", epistemic: "CALCULATED", rationale: "15.0% this quarter" },
      person: { contactId: "fx-c1", displayName: "Ravi K. (example)", reason: "Ran procurement at a competitor, 2018–2023", strength: 0.6, confirmed: true },
      question: "Is the raw-material cost spike behind the margin drop, and is it passing through to prices?",
      sources: [RESULTS],
    },
    {
      variant: "management_change", id: "fx-northwind-cfo", companySymbol: "NORTHWND", companyName: "Northwind Appliances (example)",
      category: "management_change", at: APPOINT.publishedAt, score: 0.8,
      headline: "New CFO comes from a rival's finance team",
      reasons: ["top-management change"],
      personName: "Asha V. (example)", role: "Chief Financial Officer", effective: "2027-01-01",
      profileQuote: "A chartered accountant with twenty years in consumer durables finance.",
      stints: [{ org: "Rival Appliances (example)", role: "Finance head", from: "2016", to: "2026" }, { org: "Big Audit Firm (example)", role: "Manager" }],
      path: { steps: ["You", "Meera S. (example)", "Asha V. (example)"], strength: 0.55, confirmed: true,
        explanation: "Overlapped with Asha V. at Rival Appliances, 2016–2020 (4 yrs)" },
      person: { contactId: "fx-c2", displayName: "Meera S. (example)", reason: "Overlapped with Asha V. at Rival Appliances, 2016–2020", strength: 0.55, confirmed: true },
      question: "What did Asha change in the finance function at Rival Appliances?",
      sources: [APPOINT],
    },
    {
      variant: "anomaly", id: "fx-lumen-move", companySymbol: "LUMENCAB", companyName: "Lumen Cables (example)",
      category: "unexplained_move", at: "2026-11-05T15:30:00+05:30", score: 0.75,
      headline: "Volume 3.0× normal with no filing",
      reasons: ["volume 3.0× its 20-day average", "no filing since the previous session"],
      volumeRatio: { value: 3, kind: "ratio", epistemic: "CALCULATED", formula: "today's volume ÷ average of the previous 20 sessions" },
      priceChange: { value: -6, kind: "pct", epistemic: "CALCULATED", formula: "(close − previous close) ÷ previous close" },
      tiles: [
        { label: "Volume vs 20-day average", value: { value: 3, kind: "ratio", epistemic: "CALCULATED", formula: "today's volume ÷ average of the previous 20 sessions" }, signedValue: false },
        { label: "Price change", value: { value: -6, kind: "pct", epistemic: "CALCULATED", formula: "(close − previous close) ÷ previous close" }, signedValue: true, deltaPeriod: "1 day" },
      ],
      volume30d: [10, 11, 9, 10, 12, 10, 9, 11, 10, 10, 9, 10, 11, 10, 12, 10, 9, 10, 11, 10, 10, 9, 11, 10, 10, 12, 11, 10, 10, 30],
      noFilingHours: 48,
      question: "What public developments in the cables sector could explain a move like this?",
      sources: [],
    },
  ],
  worthARead: [
    { id: "fx-w1", companyName: "Orbit Foods (example)", summary: "Board approves a new plant in the east", at: "2026-11-05T17:00:00+05:30", source: src("Orbit Foods: capex approval (example)", "2026-11-05T17:00:00+05:30") },
    { id: "fx-w2", companyName: "Delta Pharma (example)", summary: "Credit rating reaffirmed", at: "2026-11-05T12:00:00+05:30", source: src("Delta Pharma: credit rating (example)", "2026-11-05T12:00:00+05:30") },
  ],
  collapsed: [
    { category: "Investor meetings", count: 2, items: [
      { id: "fx-x1", title: "Acme Polymers: analyst meet schedule (example)", source: src("Analyst meet schedule (example)", "2026-11-05T10:00:00+05:30") },
      { id: "fx-x2", title: "Orbit Foods: analyst meet schedule (example)", source: src("Analyst meet schedule 2 (example)", "2026-11-05T11:00:00+05:30") }] },
    { category: "Routine", count: 1, items: [
      { id: "fx-x3", title: "Delta Pharma: trading window closure (example)", source: src("Trading window (example)", "2026-11-05T09:00:00+05:30") }] },
  ],
};

/** A fourth variant for /dev/cards (the digest fixture keeps exactly three "Needs you" cards). */
export const materialCardFixture: DigestResponse["needsYou"][number] = {
  variant: "material", id: "fx-orbit-ma", companySymbol: "ORBIT", companyName: "Orbit Foods (example)",
  category: "M&A", at: "2026-11-05T17:40:00+05:30", score: 0.7,
  headline: "Buys a regional snacks brand for cash",
  reasons: ["M&A"],
  summary: "Board approves acquiring 100% of a regional snacks maker, funded from internal cash.",
  // `fields` is Record<string, string> in §7.2, so it cannot carry a Num: keep it to non-numeric facts.
  fields: { Counterparty: "Sunrise Snacks (example)", "Paid with": "Internal cash", "Expected close": "Q4 FY27" },
  assumption: { ref: { id: "fx-a9", text: "Growth stays organic; no large acquisitions", source: "investor" },
    stance: "insufficient", status: "cant_check", epistemic: "INFERRED", rationale: "Deal size relative to the balance sheet is not stated" },
  person: { contactId: "fx-c5", displayName: "Tarun P. (example)", reason: "Both worked at Big Audit Firm; overlap not confirmed", strength: 0.25, confirmed: false },
  question: "How have regional snack brands held up after being bought by national players?",
  sources: [src("Orbit Foods: acquisition (example)", "2026-11-05T17:40:00+05:30", 1)],
};

const names = ["Acme Polymers", "Northwind Appliances", "Lumen Cables", "Orbit Foods", "Delta Pharma", "Granite Cement",
  "Harbor Logistics", "Ion Batteries", "Juniper Textiles", "Kestrel Engineering", "Lotus Hospitals", "Meridian Power",
  "Nimbus Software", "Oakline Chemicals", "Pioneer Steel"];
export const portfolioFixture: PortfolioRow[] = names.map((n, i) => ({
  symbol: n.split(" ")[0].toUpperCase(), name: `${n} (example)`, shortName: n, claims: [], transcripts: { count: 4, since: "2025-11-01" }, sector: ["Chemicals", "Consumer durables", "Cables", "Food", "Pharma"][i % 5],
  thesis: [{ status: i < 2 ? "behind" : "on_track" }, { status: i % 3 === 0 ? "cant_check" : "met" }, { status: "missed" }],
  credibility: i % 4 === 3 ? undefined : { met: 5 - (i % 3), resolved: 8 },
  lastEvent: { title: i < 3 ? "Needs you" : "Routine filing", at: "2026-11-05T12:00:00+05:30", tier: i < 3 ? "needs_you" : "collapsed" },
  needsYou: i < 3,
}));

export const companyFixture: CompanyPayload = {
  mode: "full", symbol: "ACMEPOLY", name: "Acme Polymers (example)", sector: "Chemicals",
  price: { close: { value: 500, kind: "count", epistemic: "SAID" }, dayChange: { value: -2, kind: "pct", epistemic: "CALCULATED", formula: "(close − previous close) ÷ previous close" }, asOf: "2026-11-05T15:30:00+05:30" },
  credibility: { met: 5, resolved: 8 },
  thesis: {
    management: [{ ref: { id: "fx-m1", text: "EBITDA margin 16–18%", source: "management", deadline: "FY27" }, stance: "contradicts", status: "behind", evidence: "15.0% year to date" }],
    investor: [{ ref: { id: "fx-a1", text: "EBITDA margin stays at or above 16%", source: "investor", deadline: "FY27" }, stance: "contradicts", status: "behind", editable: true }],
  },
  ledger: [
    { id: "fx-p1", saidAt: "2026-08-10", deadline: "FY27", metric: "ebitda_margin", scope: "company",
      quote: { ...src("Q1 FY27 call (example)", "2026-08-10T18:00:00+05:30", 7), text: "We expect margins in the range of 16 to 18 percent for the year.", speaker: "CFO" },
      guided: { low: 16, high: 18, unit: "percent" }, status: "behind", evidence: "actual 15.0% (year to date)" },
    { id: "fx-p2", saidAt: "2026-05-12", deadline: "Q2FY27", metric: "capacity", scope: "Plant 2",
      quote: { ...src("Q4 FY26 call (example)", "2026-05-12T18:00:00+05:30", 4), text: "Plant 2 will start commercial production by September.", speaker: "MD" },
      status: "cant_check", evidence: "not a reported financial line" },
  ],
  quarters: ["Q3FY26", "Q4FY26", "Q1FY27", "Q2FY27"].map((p, i) => ({
    period: p, revenue: cr(900 + i * 30), ebitdaMargin: { value: 17 - i * 0.5, kind: "pct", epistemic: "CALCULATED", formula: "EBITDA ÷ revenue" },
    pat: cr(80 - i * 2),
  })),
  nextQuestion: { text: "What would bring margins back to 16%: price increases or cheaper inputs?", people: [
    { contactId: "fx-c1", displayName: "Ravi K. (example)", reason: "Ran procurement at a competitor, 2018–2023", strength: 0.6, confirmed: true }] },
  recentFilings: [{ id: "fx-f1", title: "Q2 FY27 results (example)", at: RESULTS.publishedAt, tier: "needs_you", source: RESULTS }],
};

export const reducedCompanyFixture: CompanyPayload = {
  mode: "reduced", reducedReason: "Documents for this company weren't available from our server. Showing prices and reported numbers.",
  symbol: "GRANITE", name: "Granite Cement (example)", sector: "Cement",
  thesis: { management: [], investor: [] }, ledger: [],
  quarters: [{ period: "Q2FY27", revenue: cr(2000), ebitdaMargin: { value: 20, kind: "pct", epistemic: "CALCULATED", formula: "EBITDA ÷ revenue" }, pat: cr(200) }],
  recentFilings: [],
};

export const peopleFixture: PathResult = {
  target: "Asha V. (example)",
  people: [
    { contactId: "fx-c2", displayName: "Meera S. (example)", reason: "Overlapped with Asha V. at Rival Appliances, 2016–2020 (4 yrs)", strength: 0.55, confirmed: true, kind: "second_degree", probable: false },
    { contactId: "fx-c3", displayName: "Tarun P. (example)", reason: "Both worked at Big Audit Firm; overlap not confirmed", strength: 0.25, confirmed: false, kind: "second_degree", probable: true },
    { contactId: "fx-c4", displayName: "Lata D. (example)", reason: "At Rival Appliances (competitor) since 2021", strength: 0.4, confirmed: true, kind: "peer", probable: false },
  ],
};

export const ensureCompanyScript: { delayMs: number; event: StreamEvent }[] = [
  { delayMs: 300, event: { type: "step", id: "validate", status: "done", detail: "Found GRANITE on NSE" } },
  { delayMs: 800, event: { type: "step", id: "prices", status: "done", detail: "1 year of daily prices" } },
  { delayMs: 600, event: { type: "step", id: "results", status: "running", detail: "Reading Q2 FY27 results" } },
  { delayMs: 1200, event: { type: "step", id: "results", status: "done" } },
  { delayMs: 900, event: { type: "step", id: "transcripts", status: "failed", detail: "Transcript not reachable" } },
  { delayMs: 300, event: { type: "done", mode: "reduced", redirect: "/company/GRANITE" } },
];
