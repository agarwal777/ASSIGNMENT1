// Formulas with their real inputs, for the formula sheet: "Revenue QoQ = (₹17,030 cr − ₹13,070 cr) ÷ ₹13,070 cr
// = +30.3%". Every input is a reported XBRL fact that opens its source (element, period, unit, value).
// A calculation is only attached when its inputs reproduce the number on screen; otherwise the sheet shows
// the plain definition, so the two can never disagree.
import type { DigestEvent } from "@/lib/digest";
import { bps, inrCr, pct, period as fmtPeriod } from "@/lib/format";
import type { Calc, SourceRef } from "@/lib/types";

type Inputs = NonNullable<DigestEvent["inputs"]>;
type Metric = "revenue" | "ebitda" | "pbt" | "pat" | "exceptional" | "finance_costs" | "dna" | "other_income" | "associates";

export const ELEMENT: Partial<Record<Metric, string>> = {
  revenue: "RevenueFromOperations", pbt: "ProfitBeforeTax", pat: "ProfitLossForPeriod",
  exceptional: "ExceptionalItemsBeforeTax", finance_costs: "FinanceCosts",
  dna: "DepreciationDepletionAndAmortisationExpense", other_income: "OtherIncome",
  associates: "ShareOfProfitLossOfAssociatesAndJointVentures (accounted using the equity method)",
};
const NAME: Record<Metric, string> = {
  revenue: "revenue", ebitda: "EBITDA", pbt: "profit before tax", pat: "profit after tax", exceptional: "exceptional items",
  finance_costs: "finance costs", dna: "depreciation and amortisation", other_income: "other income", associates: "share of associates",
};

/** "Q2FY27" → "1 Jul – 30 Sep 2026". */
export function quarterSpan(p: string): string {
  const q = Number(p[1]), fy = 2000 + Number(p.slice(-2));
  const [a, b, y] = [["1 Apr", "30 Jun", fy - 1], ["1 Jul", "30 Sep", fy - 1], ["1 Oct", "31 Dec", fy - 1], ["1 Jan", "31 Mar", fy]][q - 1] as [string, string, number];
  return `${a} – ${b} ${y}`;
}

export function makeCalc(e: DigestEvent) {
  const inp = e.inputs as Inputs | undefined;
  const basis = e.results?.basis ?? "consolidated";
  const v = (p: string, m: Metric) => inp?.facts[p]?.[m];
  const src = (p: string, m: Metric): SourceRef | undefined => {
    const doc = inp?.sources[p];
    if (!doc) return undefined;
    const el = ELEMENT[m];
    // NSE XBRL file names carry the filing time (…_14082026065518_WEB.xml); other periods were filed earlier than this card.
    const stamp = doc.match(/_(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})\d{2}_WEB\.xml$/i);
    const filed = stamp ? `${stamp[3]}-${stamp[2]}-${stamp[1]}T${stamp[4]}:${stamp[5]}:00+05:30` : p === P?.cur ? e.at : "";
    return { documentId: doc, label: `${e.symbol}: ${fmtPeriod(p)} results (XBRL, ${basis})`, publishedAt: filed,
      fact: el ? { element: el, period: `${quarterSpan(p)} (${fmtPeriod(p)}, three months, ${basis})`, unit: "INR", value: Math.round(v(p, m)! * 1e7) } : undefined };
  };
  const term = (p: string, m: Metric) => ({ text: inrCr(v(p, m)!), source: src(p, m) });
  const margin = (p: string) => (v(p, "ebitda") != null && v(p, "revenue") ? (100 * v(p, "ebitda")!) / v(p, "revenue")! : null);
  const P = inp?.periods;

  /** (this − that) ÷ that, only if it rounds to the reported growth. */
  function growth(m: Metric, which: "qoq" | "yoy", shown: number | null | undefined): Calc | undefined {
    if (!P || shown == null) return undefined;
    const c = v(P.cur, m), o = v(P[which], m);
    if (c == null || o == null || o === 0) return undefined;
    if (Math.abs(Math.round(1000 * (c / o - 1)) / 10 - shown) > 0.05) return undefined;
    return { name: `${NAME[m][0].toUpperCase()}${NAME[m].slice(1)} ${which === "qoq" ? "QoQ" : "YoY"}`,
      parts: ["(", term(P.cur, m), ` (${fmtPeriod(P.cur)}) − `, term(P[which], m), ` (${fmtPeriod(P[which])})) ÷ `, term(P[which], m)],
      result: pct(shown) };
  }

  function marginValue(shown: number | null | undefined): Calc | undefined {
    if (!P || shown == null) return undefined;
    const m = margin(P.cur);
    if (m == null || Math.abs(Math.round(m * 10) / 10 - shown) > 0.05) return undefined;
    return { name: "EBITDA margin", parts: [term(P.cur, "ebitda"), " (EBITDA) ÷ ", term(P.cur, "revenue"), " (revenue)"], result: pct(shown, false) };
  }

  function marginMove(which: "qoq" | "yoy", shown: number | null | undefined): Calc | undefined {
    if (!P || shown == null) return undefined;
    const a = margin(P.cur), b = margin(P[which]);
    if (a == null || b == null || Math.abs(Math.round(100 * (a - b)) - shown) > 1) return undefined;
    const two = (x: number) => `${x.toFixed(2)}%`;
    return { name: `EBITDA margin change ${which === "qoq" ? "QoQ" : "YoY"}`,
      parts: [`${two(a)} (${fmtPeriod(P.cur)}: `, term(P.cur, "ebitda"), " ÷ ", term(P.cur, "revenue"), `) − ${two(b)} (${fmtPeriod(P[which])}: `,
        term(P[which], "ebitda"), " ÷ ", term(P[which], "revenue"), ")"],
      result: bps(shown) };
  }

  /** EBITDA from its reported components; associates only when they sit inside PBT for that filing. */
  function ebitda(shown: number | null | undefined): Calc | undefined {
    if (!P || shown == null) return undefined;
    const p = P.cur, need: Metric[] = ["pbt", "exceptional", "finance_costs", "dna", "other_income"];
    if (need.some((m) => v(p, m) == null)) return undefined;
    const inside = inp!.assoc_inside[p] && v(p, "associates") != null;
    const total = v(p, "pbt")! - v(p, "exceptional")! + v(p, "finance_costs")! + v(p, "dna")! - v(p, "other_income")! - (inside ? v(p, "associates")! : 0);
    if (Math.abs(total - shown) > 0.05) return undefined;
    return { name: "EBITDA",
      parts: [term(p, "pbt"), " profit before tax − ", term(p, "exceptional"), " exceptional items + ", term(p, "finance_costs"),
        " finance costs + ", term(p, "dna"), " depreciation and amortisation − ", term(p, "other_income"), " other income",
        ...(inside ? [" − ", term(p, "associates"), " share of associates"] : [])],
      result: inrCr(shown) };
  }

  return { growth, marginValue, marginMove, ebitda, src };
}
