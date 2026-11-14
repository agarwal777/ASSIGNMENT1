// Data access for the screens. Real data from the committed snapshot (web/data/*.json), mapped into
// the FRONTEND.md §7.2 contracts. Pure functions: no clock, no network. The investor's network is
// added on the device (lib/network.ts) because it never leaves their session.
import digestData from "@/data/digest.json";
import executivesData from "@/data/executives.json";
import { bps as fmtBps, pct as fmtPct } from "@/lib/format";
import type { DigestEvent } from "@/lib/digest";
import type { Card, DigestResponse, MetricRow, NumValue, SourceRef } from "@/lib/types";

export const DEFAULT_AS_OF: string = digestData.default_as_of;
export const SCORING_NOTE: string = digestData.scoring_note;
const EVENTS = digestData.events as unknown as DigestEvent[];
export const EVENT_RANGE = {
  first: EVENTS.reduce((m, e) => (e.at < m ? e.at : m), EVENTS[0].at),
  last: EVENTS.reduce((m, e) => (e.at > m ? e.at : m), EVENTS[0].at),
};

type Exec = (typeof executivesData.executives)[number] & { title?: string; effective?: string; profile_quote?: string };
const EXECS = executivesData.executives as Exec[];

export const READ_MIN = { folded: 0.5, worth: 1.5 };

// ── helpers ──────────────────────────────────────────────────────────────────────────
const sourceOf = (e: DigestEvent): SourceRef | null =>
  e.url ? { documentId: e.url, label: `${e.symbol}: ${e.title}`, publishedAt: e.at } : null;

const growth = (value: number | null | undefined, what: string): NumValue | undefined =>
  value == null ? undefined
    : { value, kind: "pct", epistemic: "CALCULATED", formula: `${what}: (this period − comparison period) ÷ comparison period` };

const marginMove = (value: number | null | undefined, vs: string): NumValue | undefined =>
  value == null ? undefined
    : { value, kind: "bps", epistemic: "CALCULATED", formula: `EBITDA margin this quarter − EBITDA margin ${vs}, in basis points` };

const EBITDA_FORMULA =
  "EBITDA = profit before exceptional items and tax + finance costs + depreciation − other income (− share of associates when it sits inside PBT)";

/** Verdict from the numbers, largest surprise first. Template only: no model writes headlines. */
function resultsHeadline(e: DigestEvent): string {
  const r = e.results!;
  const m = r.ebitda_margin.yoy_bps ?? null;
  const rev = r.metrics.revenue?.yoy_pct ?? null;
  const pat = r.metrics.pat?.yoy_pct ?? null;
  const dir = (v: number) => (v < 0 ? "down" : "up");
  if (m != null && Math.abs(m) >= 150 && rev != null) {
    const against = (m < 0 && rev > 0) || (m > 0 && rev < 0);
    // The words carry the direction, so magnitudes are unsigned ("down 327 bps", not "down +327 bps").
    return `Margin ${dir(m)} ${Math.abs(Math.round(m)).toLocaleString("en-IN")} bps YoY ${against ? "despite" : "with"} revenue ${dir(rev)} ${fmtPct(Math.abs(rev), false)}`;
  }
  if (rev != null && pat != null && Math.abs(pat) >= 30)
    return `Revenue ${dir(rev)} ${fmtPct(Math.abs(rev), false)} YoY; profit after tax ${dir(pat)} ${fmtPct(Math.abs(pat), false)}`;
  if (rev != null) return `Revenue ${dir(rev)} ${fmtPct(Math.abs(rev), false)} YoY`;
  return `${r.period ?? "Latest"} results filed`;
}

function metrics(e: DigestEvent, src: SourceRef | null): MetricRow[] {
  const r = e.results!;
  const xbrl: SourceRef = { documentId: r.source, label: `${e.symbol}: ${r.period} results (XBRL, ${r.basis})`, publishedAt: e.at };
  const rows: MetricRow[] = [];
  const add = (metric: MetricRow["metric"], key: "revenue" | "ebitda" | "pbt" | "pat", label: string) => {
    const m = r.metrics[key];
    if (!m || m.value_cr == null) return;
    rows.push({
      metric,
      value: key === "ebitda"
        ? { value: m.value_cr, kind: "inr_cr", epistemic: "CALCULATED", formula: EBITDA_FORMULA, source: xbrl }
        : { value: m.value_cr, kind: "inr_cr", epistemic: "EXTRACTED", source: xbrl },
      qoq: growth(m.qoq_pct, `${label} QoQ`),
      yoy: growth(m.yoy_pct, `${label} YoY`),
    });
  };
  add("revenue", "revenue", "Revenue");
  add("ebitda", "ebitda", "EBITDA");
  if (r.ebitda_margin.pct != null) rows.push({
    metric: "ebitda_margin",
    value: { value: r.ebitda_margin.pct, kind: "pct", epistemic: "CALCULATED", formula: "EBITDA ÷ revenue", source: xbrl },
    qoq: marginMove(r.ebitda_margin.qoq_bps, "last quarter"),
    yoy: marginMove(r.ebitda_margin.yoy_bps, "in the same quarter last year"),
  });
  add("pbt", "pbt", "PBT");
  add("pat", "pat", "PAT");
  void src;
  return rows;
}

function exceptional(e: DigestEvent): NumValue | undefined {
  const w = e.results?.warnings.find((x) => x.includes("exceptional"));
  const m = w?.match(/₹(-?[\d,]+(?:\.\d+)?)/);
  if (!m) return undefined;
  return { value: Number(m[1].replace(/,/g, "")), kind: "inr_cr", epistemic: "EXTRACTED",
    source: { documentId: e.results!.source, label: `${e.symbol}: exceptional items (XBRL)`, publishedAt: e.at } };
}

/** One question per card from public evidence; asks for context, never unpublished information. */
function questionFor(e: DigestEvent): string {
  const r = e.results;
  if (r?.metrics?.revenue) {
    const m = r.ebitda_margin.yoy_bps;
    if (m != null && Math.abs(m) >= 100) return `What moved the margin ${fmtBps(m)} YoY: pricing, mix or input costs, and is it the same at peers?`;
    return "How much of this quarter's growth is volume and how much is price in this business?";
  }
  if (e.category === "management_change") return "What does a leader with this background usually prioritise in the first year?";
  if (e.category === "M&A") return `What does ${e.name} get from this deal that it couldn't build itself?`;
  if (e.kind === "move") return "What public developments in this sector could explain a move like this?";
  return `What would you ask ${e.name}'s management about this on the next call?`;
}

// ── cards ────────────────────────────────────────────────────────────────────────────
export function toCard(e: DigestEvent): Card {
  const src = sourceOf(e);
  const base = {
    id: e.id, companySymbol: e.symbol, companyName: e.name, category: e.category, at: e.at,
    score: e.score, reasons: e.reasons, question: questionFor(e),
    sources: [src, ...e.related.slice(0, 1).map((x) => ({ documentId: x.url, label: `${e.symbol}: ${x.title}`, publishedAt: e.at }))]
      .filter((x): x is SourceRef => !!x && !!x.documentId),
  };
  if (e.results?.metrics && Object.keys(e.results.metrics).length) {
    return { ...base, variant: "results", headline: resultsHeadline(e), period: e.results.period ?? "",
      metrics: metrics(e, src), exceptional: exceptional(e) };
  }
  const exec = EXECS.find((x) => x.events.includes(e.id) && x.effective);
  if (e.category === "management_change" && exec) {
    return { ...base, variant: "management_change",
      headline: `${exec.name} named ${exec.title ?? "to the board"}`,
      personName: exec.name, role: exec.title ?? exec.role, effective: exec.effective!,
      profileQuote: exec.profile_quote,
      stints: exec.stints.map((s) => ({ org: s.org, role: s.role ?? undefined,
        from: s.start ?? undefined, to: s.start ? (s.end ?? undefined) : undefined })) };
  }
  if (e.kind === "move" && e.move) {
    const vol = e.move.volume_multiple, ret = e.move.return_pct;
    const unexplained = e.category === "unexplained_move";
    return { ...base, variant: "anomaly",
      headline: vol != null && vol > 2
        ? `Volume ${vol.toFixed(1)}× normal${unexplained ? " with no filing" : ""}`
        : `Price ${ret != null && ret < 0 ? "down" : "up"} ${fmtPct(Math.abs(ret ?? 0), false)}${unexplained ? " with no filing" : ""}`,
      volumeRatio: vol != null ? { value: vol, kind: "ratio", epistemic: "CALCULATED", formula: "today's volume ÷ average of the previous 20 sessions" } : undefined,
      priceChange: ret != null ? { value: ret, kind: "pct", epistemic: "CALCULATED", formula: "(close − previous close) ÷ previous close" } : undefined,
      volume30d: e.volume30d ?? [], noFilingHours: e.no_filing_hours ?? 0 };
  }
  return { ...base, variant: "material", headline: e.summary || e.title, summary: e.title };
}

// ── digest ───────────────────────────────────────────────────────────────────────────
export function getDigest(asOf: string, hours: number): DigestResponse & { all: DigestEvent[] } {
  const end = new Date(asOf).getTime();
  const start = end - hours * 3600_000;
  const inWin = EVENTS.filter((e) => { const t = new Date(e.at).getTime(); return t > start && t <= end; });
  const by = (b: DigestEvent["bucket"]) => inWin.filter((e) => e.bucket === b).sort((a, z) => z.score - a.score);
  const needs = by("needs_you");
  const top = needs.slice(0, 5);
  const worth = [...needs.slice(5), ...by("worth_a_read")];
  const folded = by("collapsed");
  const groups = new Map<string, DigestResponse["collapsed"][number]>();
  for (const e of folded) {
    const g = groups.get(e.category) ?? { category: e.category, count: 0, items: [] };
    g.count += 1;
    const s = sourceOf(e);
    if (s) g.items.push({ id: e.id, title: `${e.symbol}: ${e.summary || e.title}`, source: s });
    groups.set(e.category, g);
  }
  const minutes = Math.round(folded.length * READ_MIN.folded + worth.length * READ_MIN.worth);
  return {
    window: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), replay: true },
    totals: { filings: inWin.filter((e) => e.kind === "filing").length, touched: top.length },
    readingEstimate: { minutes, formula: `${folded.length} folded × ${READ_MIN.folded} min + ${worth.length} one-liners × ${READ_MIN.worth} min (assumed reading times)` },
    needsYou: top.map(toCard),
    worthARead: worth.map((e) => ({
      id: e.id, companyName: `${e.name}`, at: e.at,
      summary: e.results?.period ? resultsHeadline(e) : (e.summary || e.title),
      source: sourceOf(e) ?? { documentId: "", label: `${e.symbol}: end-of-day prices`, publishedAt: e.at },
    })),
    collapsed: [...groups.values()].sort((a, b) => b.count - a.count),
    all: inWin,
  };
}
