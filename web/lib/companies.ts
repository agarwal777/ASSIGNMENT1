// Server-side only: imported by server components (Portfolio, Company), so companies.json never
// reaches a client bundle. Maps the snapshot into the CompanyPayload / PortfolioRow contracts.
import data from "@/data/companies.json";
import executivesData from "@/data/executives.json";
import { companySignals, DATA_TO_DAY, filingHeadline, QUARTERS_COMPACT } from "@/lib/api";
import { type RawClaimFields, toClaim } from "@/lib/claims";
import { isProblem, STATUS_ORDER } from "@/lib/status";
import type {
  CompanyPayload, LedgerPromise, NumValue, PortfolioRow, PromiseStatus, QuarterRow, SourceRef, Stance, ThesisItem,
} from "@/lib/types";

type Raw = (typeof data.companies)[keyof typeof data.companies];
type RawPromise = {
  id: string; said_at: string; deadline_period: string; metric: string; scope?: string; statement_verbatim: string;
  speaker_role: string; page: number; source: string; target_low?: number | null; target_high?: number | null;
  unit: string; status: string; evidence: string; revised_by?: string;
};
type RawItem = RawClaimFields & { id: string; text: string; deadline: string; stance: string; status: string; evidence: string };

const COMPANIES = data.companies as Record<string, Raw>;
export const SNAPSHOT_AS_OF: string = data.as_of;
export const companySymbols = () => Object.keys(COMPANIES);

const xbrl = (sym: string, period: string, url: string | null | undefined): SourceRef | undefined =>
  url ? { documentId: url, label: `${sym}: ${period} results (XBRL)`, publishedAt: SNAPSHOT_AS_OF } : undefined;

function quarters(sym: string, r: Raw): QuarterRow[] {
  return (r.quarters as { period: string; revenue: number | null; pat: number | null; ebitda_margin: number | null;
    revenue_yoy: number | null; source?: string | null }[]).map((q) => {
    const src = xbrl(sym, q.period, q.source);
    return {
      period: q.period,
      revenue: q.revenue != null ? { value: q.revenue, kind: "inr_cr", epistemic: "EXTRACTED", source: src } : undefined,
      pat: q.pat != null ? { value: q.pat, kind: "inr_cr", epistemic: "EXTRACTED", source: src } : undefined,
      ebitdaMargin: q.ebitda_margin != null ? { value: q.ebitda_margin, kind: "pct", epistemic: "CALCULATED",
        formula: "EBITDA ÷ revenue, where EBITDA = profit before exceptional items and tax + finance costs + depreciation − other income", source: src } : undefined,
      revenueYoy: q.revenue_yoy != null ? { value: q.revenue_yoy, kind: "pct", epistemic: "CALCULATED",
        formula: "(revenue this quarter − same quarter last year) ÷ same quarter last year" } : undefined,
    } satisfies QuarterRow;
  });
}

// Checkable outcomes first (what moved), then what can't be checked yet; oldest promise first within each.
const rank = (s: string) => { const i = STATUS_ORDER.indexOf(s as PromiseStatus); return i < 0 ? 9 : i; };

function ledger(sym: string, r: Raw): LedgerPromise[] {
  return [...(r.ledger as RawPromise[])].sort((a, b) =>
    rank(a.status) - rank(b.status) || a.said_at.localeCompare(b.said_at)).map((p) => ({
    id: p.id, saidAt: p.said_at, deadline: p.deadline_period, metric: p.metric, scope: p.scope ?? "company",
    quote: { documentId: p.source, page: p.page, label: `${sym}: earnings call transcript`, publishedAt: p.said_at,
      text: p.statement_verbatim, speaker: p.speaker_role },
    guided: p.target_low != null || p.target_high != null
      ? { low: p.target_low ?? undefined, high: p.target_high ?? undefined, unit: p.unit } : undefined,
    status: p.status as PromiseStatus, evidence: p.evidence, revisedBy: p.revised_by,
  }));
}

const item = (source: "management" | "investor") => (i: RawItem): ThesisItem => ({
  ref: { id: i.id, text: i.text, source, deadline: i.deadline }, stance: i.stance as Stance, status: i.status as PromiseStatus, evidence: i.evidence, claim: toClaim(i),
});

function nextQuestion(r: Raw): string {
  const all = [...(r.thesis.investor as RawItem[]), ...(r.thesis.management as RawItem[])];
  const hit = all.find((i) => isProblem(i.status as PromiseStatus));
  if (hit) {
    const what = (({ ebitda_margin: "EBITDA margin", revenue_growth: "revenue growth", pat_growth: "profit growth" }) as Record<string, string>)[
      (hit as RawItem).metric] ?? "this target";
    return `What would it take to close the gap on ${what} by ${hit.deadline}, and is that in management's hands?`;
  }
  if ((r.ledger as RawPromise[]).some((p) => p.status === "cant_check" && p.scope && p.scope !== "company"))
    return "Which of management's segment targets matter most for the stock, and how are they tracking?";
  return `If you were me, what would you ask ${r.name}'s management on the next call?`;
}

export function getCompany(symbol: string): CompanyPayload | null {
  const r = COMPANIES[symbol];
  if (!r) return null;
  const p = r.price as { close: number; day_change: number; as_of: string } | null;
  // End-of-day close, read from market data (not a company statement): rupees with paise, with its source.
  const close: NumValue | undefined = p ? { value: p.close, kind: "inr", epistemic: "EXTRACTED",
    source: { documentId: `https://finance.yahoo.com/quote/${encodeURIComponent(r.symbol)}.NS/history`,
      label: `${r.symbol}: end-of-day close (Yahoo Finance)`, publishedAt: `${p.as_of}T15:30:00+05:30` } } : undefined;
  return {
    mode: "full", symbol: r.symbol, name: r.name, sector: r.sector,
    price: p && close ? { close, asOf: p.as_of,
      dayChange: { value: p.day_change, kind: "pct", epistemic: "CALCULATED", formula: "(close − previous close) ÷ previous close" } } : undefined,
    credibility: r.credibility,
    transcripts: r.transcripts as CompanyPayload["transcripts"],
    thesis: { management: (r.thesis.management as RawItem[]).map(item("management")),
      investor: (r.thesis.investor as RawItem[]).map((i) => ({ ...item("investor")(i), editable: true })) },
    ledger: ledger(r.symbol, r),
    quarters: quarters(r.symbol, r),
    nextQuestion: { text: nextQuestion(r), people: [] },
    recentFilings: (r.recent_filings as { id: string; title: string; at: string; tier: string; url: string | null }[]).map((f) => ({
      id: f.id, title: f.title, headline: filingHeadline(f.id), at: f.at, tier: f.tier as "needs_you" | "worth_a_read" | "collapsed",
      source: { documentId: f.url ?? "", label: `${r.symbol}: ${f.title}`, publishedAt: f.at },
    })),
  };
}

export const hasLedgerData = (symbol: string) => Boolean(COMPANIES[symbol]?.has_ledger);

/** "Voltas Limited" → "Voltas". */
export const shortName = (n: string) => n.replace(/\s+(Limited|Ltd\.?)$/i, "");

const QUARTER_END = ["", "06-30", "09-30", "12-31", "03-31"];
/**
 * The next dated thing we know about: the next quarter's results deadline under SEBI's listing rules
 * (LODR Reg. 33: 45 days after a quarter, 60 days for the audited Q4), or an announced executive
 * start date, whichever comes first.
 */
function nextEvent(r: Raw): PortfolioRow["nextEvent"] {
  const out: NonNullable<PortfolioRow["nextEvent"]>[] = [];
  const last = (r.quarters as { period: string }[]).at(-1)?.period.match(/^Q([1-4])FY(\d{2})$/);
  if (last) {
    const q = Number(last[1]) % 4 + 1, fy = Number(last[2]) + (q === 1 ? 1 : 0);
    const end = new Date(`${2000 + fy - (q === 4 ? 0 : 1)}-${QUARTER_END[q]}T00:00:00+05:30`);
    const due = new Date(end.getTime() + (q === 4 ? 60 : 45) * 864e5);
    out.push({ text: `Q${q} FY${fy} results due by`, at: due.toISOString(), note: "listing-rule deadline" });
  }
  for (const x of executivesData.executives as { name: string; company?: string; effective?: string; title?: string }[]) {
    if (x.company === r.symbol && x.effective && x.effective > SNAPSHOT_AS_OF.slice(0, 10))
      out.push({ text: `${x.name} starts as ${x.title ?? "executive"}`, at: `${x.effective}T00:00:00+05:30` });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))[0];
}

/** Rows for the demo portfolio, or (all = true) for every company in FINN's snapshot. */
export function getPortfolio(all = false): PortfolioRow[] {
  const inDemo = (r: Raw) => r.role.split(";").includes("portfolio");
  const rows: PortfolioRow[] = Object.values(COMPANIES).filter((r) => all || inDemo(r)).map((r) => {
    const items = [...(r.thesis.investor as RawItem[]).map((i) => ({ ...i, src: "investor" as const })),
      ...(r.thesis.management as RawItem[]).map((i) => ({ ...i, src: "management" as const }))];
    const sig = companySignals(r.symbol);
    return {
    symbol: r.symbol, name: r.name, shortName: shortName(r.name), sector: r.sector,
    claims: items.flatMap((i) => { const claim = toClaim(i); return claim ? [{ label: i.text, claim, source: i.src }] : []; }),
    quarters: QUARTERS_COMPACT[r.symbol], dataTo: DATA_TO_DAY,
    headline: sig.headline, move: sig.move, eventId: sig.eventId, nextEvent: nextEvent(r),
    transcripts: r.transcripts,
    thesis: items.map((i) => ({ status: i.status as PromiseStatus, source: i.src })),
    credibility: r.credibility.resolved > 0 ? r.credibility : undefined,
    lastEvent: r.last_event ? { title: r.last_event.title, at: r.last_event.at,
      tier: r.last_event.tier as "needs_you" | "worth_a_read" | "collapsed" } : undefined,
    needsYou: r.needs_you, demo: inDemo(r), research: !inDemo(r),
  }; });
  const contradicted = (r: PortfolioRow) => r.thesis.filter((t) => isProblem(t.status)).length;
  return rows.sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || contradicted(b) - contradicted(a) || a.name.localeCompare(b.name));
}
