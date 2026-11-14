// Types and pure helpers for the Today screen. No clock access: every time is relative to `asOf`.

export type Metric = { value_cr: number | null; qoq_pct: number | null; yoy_pct: number | null };
export type Results = {
  period: string | null;
  basis: string;
  metrics: Partial<Record<"revenue" | "ebitda" | "pbt" | "pat", Metric>>;
  ebitda_margin: { pct?: number | null; qoq_bps?: number | null; yoy_bps?: number | null };
  warnings: string[];
  source: string;
};
export type DigestEvent = {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  kind: "filing" | "move";
  category: string;
  at: string;
  title: string;
  summary: string;
  url: string | null;
  related: { title: string; url: string }[];
  results?: Results;
  move?: { volume_multiple: number | null; return_pct: number | null };
  score: number;
  bucket: "needs_you" | "worth_a_read" | "collapsed";
  reasons: string[];
};
export type Digest = { default_as_of: string; scoring_note: string; events: DigestEvent[] };

export const WINDOWS = [
  { label: "24h", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
] as const;

export function inWindow(events: DigestEvent[], asOf: Date, hours: number): DigestEvent[] {
  const end = asOf.getTime();
  const start = end - hours * 3600_000;
  return events.filter((e) => {
    const t = new Date(e.at).getTime();
    return t > start && t <= end;
  });
}

export function split(events: DigestEvent[]) {
  const by = (b: DigestEvent["bucket"]) =>
    events.filter((e) => e.bucket === b).sort((a, z) => z.score - a.score);
  const needs = by("needs_you").slice(0, 5);
  // Anything past the five-card cap drops to "worth a read" rather than disappearing.
  const overflow = by("needs_you").slice(5);
  return { needs, worth: [...overflow, ...by("worth_a_read")], folded: by("collapsed") };
}

const CATEGORY_LABEL: Record<string, string> = {
  results: "Results", management_change: "Management", "M&A": "M&A", fund_raise: "Fund raise",
  litigation: "Litigation", credit_rating: "Credit rating", earnings_call: "Earnings call",
  investor_meetings: "Investor meetings", press_release: "Press release", dividend: "Dividend",
  capex: "Capex", agm_egm: "AGM / EGM", unclassified: "Routine", pledging: "Pledging",
  unexplained_move: "Unexplained move", price_volume: "Price / volume",
};
export const label = (c: string) => CATEGORY_LABEL[c] ?? c.replace(/_/g, " ");

const IST = { timeZone: "Asia/Kolkata" } as const;
export const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-IN", { ...IST, weekday: "long", day: "numeric", month: "short" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { ...IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const crore = (v: number | null | undefined) =>
  v == null ? "—" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: v >= 1000 ? 0 : 1 })} cr`;
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);
export const bps = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v} bps`);

/** Minutes of reading skipped, from stated assumptions (shown on tap). */
export const READ_MIN = { folded: 0.5, worth: 1.5 };
export const minutesSkipped = (folded: number, worth: number) =>
  Math.round(folded * READ_MIN.folded + worth * READ_MIN.worth);
