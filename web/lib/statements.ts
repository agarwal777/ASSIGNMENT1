// Server only: balance sheet, cash flow and segment mix for one company, from the annual and half-year
// XBRL results filings (workers/build_statements.py → data/statements.json). Every extracted number
// carries its XBRL fact; every derived one is a calculation whose inputs open their facts.
import statementsData from "@/data/statements.json";
import { formatValue, inrCr } from "@/lib/format";
import { xbrlFiledOn } from "@/lib/priceChart";
import type { NumValue, SourceRef } from "@/lib/types";

type Raw = {
  basis: string; balance_date: string; flow_from: string; flow_to: string; period: string; source: string;
  balance: Record<string, number>; flow: Record<string, number>;
  segments: { name: string; revenue_q: number | null; revenue_ytd: number | null }[];
};
const DATA = statementsData as unknown as Record<string, { basis: string; periods: Raw[] }>;

const ELEMENT: Record<string, string> = {
  total_assets: "Assets", equity: "Equity", equity_owners: "EquityAttributableToOwnersOfParent",
  borrowings_noncurrent: "BorrowingsNoncurrent", borrowings_current: "BorrowingsCurrent",
  cash: "CashAndCashEquivalents", bank_balances: "BankBalanceOtherThanCashAndCashEquivalents",
  inventories: "Inventories", receivables: "TradeReceivablesCurrent", payables: "TradePayablesCurrent",
  current_assets: "CurrentAssets", current_liabilities: "CurrentLiabilities",
  cfo: "CashFlowsFromUsedInOperatingActivities", cfi: "CashFlowsFromUsedInInvestingActivities",
  cff: "CashFlowsFromUsedInFinancingActivities", capex: "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
  revenue: "RevenueFromOperations", pat: "ProfitLossForPeriod",
};
export const LABEL: Record<string, string> = {
  borrowings_noncurrent: "Long-term borrowings", borrowings_current: "Short-term borrowings", cash: "Cash and cash equivalents",
  bank_balances: "Other bank balances", equity_owners: "Equity (owners)", receivables: "Trade receivables",
  inventories: "Inventories", payables: "Trade payables", current_assets: "Current assets",
  current_liabilities: "Current liabilities", cfo: "Cash from operations", capex: "Capex (plant and equipment bought)",
  revenue: "Revenue", pat: "Profit after tax",
};

const month = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
/** Apr–Mar → "FY26"; Apr–Sep → "H1 FY27". */
function flowLabel(from: string, to: string): string {
  const fy = Number(to.slice(0, 4)) + (Number(to.slice(5, 7)) >= 4 ? 1 : 0);
  return `${to.slice(5, 7) === "03" ? "" : "H1 "}FY${String(fy % 100).padStart(2, "0")}`;
}
/** "a ) Segment - A ( Unitary Cooling Products )" → "Unitary Cooling Products"; a plain name is kept. */
export function segmentName(raw: string): string {
  let s = raw.trim().replace(/^\(?[a-z]\s*[).]\s*/i, "");          // "(a) ", "a) ", "a. " list markers
  const br = s.match(/^Segment\s*[-–]?\s*[A-Z0-9]*\s*\(\s*(.+?)\s*\)?\s*$/i);   // "Segment - A ( Name )"
  s = br ? br[1] : s.replace(/^Segment\s*[-–]?\s*[A-Z0-9]+\s*[:-]?\s*/i, "");
  return s.trim() || raw.trim();
}
/** Rows a filing lists among segments that are not segments. */
const NOT_A_SEGMENT = /inter[\s-]*segment|eliminat|unallocat/i;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;

export type StatRow = { label: string; values: (NumValue | null)[]; signed?: boolean; hint?: string };
export type StatementsView = {
  basis: string;
  balanceCols: string[]; balance: StatRow[];
  flowCols: string[]; flow: StatRow[];
  segments: { period: string; total: number; items: { name: string; revenue: NumValue; share: NumValue }[]; source: SourceRef } | null;
};

export function statementsFor(symbol: string): StatementsView | null {
  const s = DATA[symbol];
  if (!s?.periods.length) return null;
  // Latest first: on a phone the newest period is the one in view; older ones scroll in.
  const ps = [...s.periods].reverse();
  const src = (p: Raw, field: string, which: "balance" | "flow"): SourceRef => {
    const filed = xbrlFiledOn(p.source);
    const raw = which === "balance" ? p.balance[field] : p.flow[field];
    return {
      documentId: p.source, label: `${symbol}: ${p.period} results (XBRL)`,
      publishedAt: filed ? `${filed}T12:00:00+05:30` : `${p.balance_date}T12:00:00+05:30`,
      fact: { element: `in-capmkt:${ELEMENT[field]}`, period: which === "balance" ? p.balance_date : `${p.flow_from} to ${p.flow_to}`,
        unit: "INR", value: Math.round(raw * 1e7) },
    };
  };
  const ext = (p: Raw, field: string, which: "balance" | "flow"): NumValue | null => {
    const v = which === "balance" ? p.balance[field] : p.flow[field];
    return v == null ? null : { value: v, kind: "inr_cr", epistemic: "EXTRACTED", source: src(p, field, which) };
  };
  /** A derived value: name = a ⊕ b …, each input a tappable fact. */
  const calc = (p: Raw, name: string, kind: NumValue["kind"], value: number | null, terms: (string | [string, "balance" | "flow"])[]): NumValue | null => {
    if (value == null || !Number.isFinite(value)) return null;
    const parts = terms.map((t) => typeof t === "string" ? t : {
      text: inrCr((t[1] === "balance" ? p.balance : p.flow)[t[0]]), source: src(p, t[0], t[1]) });
    return { value, kind, epistemic: "CALCULATED", calc: { name, parts, result: formatValue(kind, value, kind === "inr_cr") } };
  };
  const b = (p: Raw, k: string) => p.balance[k] ?? null;
  const f = (p: Raw, k: string) => p.flow[k] ?? null;
  const borrow = (p: Raw) => (b(p, "borrowings_noncurrent") ?? 0) + (b(p, "borrowings_current") ?? 0);
  const cashBank = (p: Raw) => (b(p, "cash") ?? 0) + (b(p, "bank_balances") ?? 0);
  const dayRow = (field: string, label: string): StatRow => ({
    label, hint: "days of revenue",
    values: ps.map((p) => {
      const r = f(p, "revenue"), x = b(p, field);
      return r && x != null ? calc(p, `${label} (days)`, "count", Math.round((x / r) * days(p.flow_from, p.flow_to)),
        [[field, "balance"], " ÷ ", ["revenue", "flow"], ` × ${days(p.flow_from, p.flow_to)} days`]) : null;
    }),
  });

  const balance: StatRow[] = [
    { label: "Borrowings", values: ps.map((p) => calc(p, "Borrowings", "inr_cr", borrow(p),
      [["borrowings_noncurrent", "balance"], " + ", ["borrowings_current", "balance"]])) },
    { label: "Cash and bank balances", values: ps.map((p) => calc(p, "Cash and bank balances", "inr_cr", cashBank(p),
      [["cash", "balance"], " + ", ["bank_balances", "balance"]])) },
    { label: "Net debt", hint: "negative = net cash", signed: true, values: ps.map((p) => calc(p, "Net debt", "inr_cr",
      Math.round((borrow(p) - cashBank(p)) * 100) / 100,
      [["borrowings_noncurrent", "balance"], " + ", ["borrowings_current", "balance"], " − ", ["cash", "balance"], " − ", ["bank_balances", "balance"]])) },
    { label: "Equity (owners)", values: ps.map((p) => ext(p, "equity_owners", "balance")) },
    { label: "Debt to equity", values: ps.map((p) => {
      const e = b(p, "equity_owners");
      return e ? calc(p, "Debt to equity", "ratio", Math.round((borrow(p) / e) * 100) / 100,
        ["(", ["borrowings_noncurrent", "balance"], " + ", ["borrowings_current", "balance"], ") ÷ ", ["equity_owners", "balance"]]) : null;
    }) },
    { label: "Current ratio", values: ps.map((p) => {
      const l = b(p, "current_liabilities"), a = b(p, "current_assets");
      return l && a != null ? calc(p, "Current ratio", "ratio", Math.round((a / l) * 100) / 100,
        [["current_assets", "balance"], " ÷ ", ["current_liabilities", "balance"]]) : null;
    }) },
    dayRow("receivables", "Receivable days"),
    dayRow("inventories", "Inventory days"),
    dayRow("payables", "Payable days"),
  ];

  const flow: StatRow[] = [
    { label: "Revenue", values: ps.map((p) => ext(p, "revenue", "flow")) },
    { label: "Profit after tax", values: ps.map((p) => ext(p, "pat", "flow")) },
    { label: "Cash from operations", signed: true, values: ps.map((p) => ext(p, "cfo", "flow")) },
    { label: "Capex", hint: "plant and equipment bought", values: ps.map((p) => ext(p, "capex", "flow")) },
    { label: "Free cash flow", signed: true, values: ps.map((p) => {
      const o = f(p, "cfo"), c = f(p, "capex");
      return o != null && c != null ? calc(p, "Free cash flow", "inr_cr", Math.round((o - c) * 100) / 100,
        [["cfo", "flow"], " − ", ["capex", "flow"]]) : null;
    }) },
    { label: "Cash conversion", hint: "cash from operations ÷ profit", values: ps.map((p) => {
      const o = f(p, "cfo"), t = f(p, "pat");
      return o != null && t && t > 0 ? calc(p, "Cash conversion", "ratio", Math.round((o / t) * 100) / 100,
        [["cfo", "flow"], " ÷ ", ["pat", "flow"]]) : null;
    }) },
  ];

  const segP = ps.find((p) => p.segments.some((x) => x.revenue_ytd != null));
  let segments: StatementsView["segments"] = null;
  if (segP) {
    const items = segP.segments.filter((x) => x.revenue_ytd != null && x.revenue_ytd > 0 && !NOT_A_SEGMENT.test(x.name));
    const total = items.reduce((t, x) => t + x.revenue_ytd!, 0);
    const source: SourceRef = { documentId: segP.source, label: `${symbol}: ${segP.period} results (XBRL), segment information`,
      publishedAt: `${xbrlFiledOn(segP.source) ?? segP.balance_date}T12:00:00+05:30` };
    segments = {
      period: flowLabel(segP.flow_from, segP.flow_to), total: Math.round(total * 100) / 100, source,
      items: items.sort((a, z) => z.revenue_ytd! - a.revenue_ytd!).map((x) => ({
        name: segmentName(x.name),
        revenue: { value: x.revenue_ytd!, kind: "inr_cr", epistemic: "EXTRACTED", source: { ...source,
          fact: { element: "in-capmkt:SegmentRevenue", period: `${segP.flow_from} to ${segP.flow_to}`, unit: "INR", value: Math.round(x.revenue_ytd! * 1e7) } } },
        share: { value: Math.round((x.revenue_ytd! / total) * 1000) / 10, kind: "pct", epistemic: "CALCULATED",
          formula: `segment revenue ÷ total segment revenue (${inrCr(total)}, before inter-segment eliminations)` },
      })),
    };
  }

  return {
    basis: s.basis,
    balanceCols: ps.map((p) => month(p.balance_date)), balance,
    flowCols: ps.map((p) => flowLabel(p.flow_from, p.flow_to)), flow,
    segments,
  };
}

/** Evidence lines for the company question box: the latest balance sheet and cash flow, as filed. */
export function statementEvidence(symbol: string): { text: string; source: SourceRef }[] {
  const p = DATA[symbol]?.periods.at(-1);
  if (!p) return [];
  const source: SourceRef = { documentId: p.source, label: `${symbol}: ${p.period} results (XBRL)`,
    publishedAt: `${xbrlFiledOn(p.source) ?? p.balance_date}T12:00:00+05:30` };
  const c = (k: string, from: Record<string, number>) => (from[k] == null ? "not reported" : inrCr(from[k]));
  const out = [{ source, text: `Balance sheet at ${month(p.balance_date)} (results filing): long-term borrowings ${c("borrowings_noncurrent", p.balance)}, short-term borrowings ${c("borrowings_current", p.balance)}, cash and cash equivalents ${c("cash", p.balance)}, other bank balances ${c("bank_balances", p.balance)}, equity attributable to owners ${c("equity_owners", p.balance)}, trade receivables ${c("receivables", p.balance)}, inventories ${c("inventories", p.balance)}.` },
    { source, text: `Cash flow for ${flowLabel(p.flow_from, p.flow_to)} (results filing): cash from operations ${c("cfo", p.flow)}, purchase of property, plant and equipment ${c("capex", p.flow)}, profit after tax ${c("pat", p.flow)}, revenue ${c("revenue", p.flow)}.` }];
  const segs = p.segments.filter((x) => x.revenue_ytd != null);
  if (segs.length) out.push({ source, text: `Segment revenue for ${flowLabel(p.flow_from, p.flow_to)}: ${segs.map((x) => `${x.name} ${inrCr(x.revenue_ytd!)}`).join("; ")}.` });
  return out;
}
