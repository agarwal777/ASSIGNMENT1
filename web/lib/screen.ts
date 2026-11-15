// Portfolio search and screen: pure functions over the compact quarters every row carries
// ([period, revenue ₹ cr, EBITDA margin %], oldest first). Alias-free so `node --test` can load it.

export type Compact = [string, number | null, number | null][];
export type Metrics = { period: string; margin: number | null; revenueYoy: number | null; marginYoyBps: number | null };
export type Screen = {
  text: string; sector: string;
  minMargin: number | null; minGrowth: number | null; minMarginChange: number | null;
  sort: "default" | "margin" | "growth" | "marginChange";
};
export const EMPTY_SCREEN: Screen = { text: "", sector: "", minMargin: null, minGrowth: null, minMarginChange: null, sort: "default" };

/** "Q2FY27" → "Q2FY26" */
const yearAgo = (p: string) => p.replace(/FY(\d{2})$/, (_, y: string) => `FY${String(Number(y) - 1).padStart(2, "0")}`);

/** Latest reported quarter: EBITDA margin, revenue growth and margin change against the same quarter a year earlier. */
export function metricsOf(q: Compact | undefined): Metrics | null {
  const last = q?.at(-1);
  if (!q || !last) return null;
  const [period, rev, margin] = last;
  const prev = q.find(([p]) => p === yearAgo(period));
  const revenueYoy = rev != null && prev?.[1] ? Math.round(((rev - prev[1]) / prev[1]) * 1000) / 10 : null;
  const marginYoyBps = margin != null && prev?.[2] != null ? Math.round((margin - prev[2]) * 100) : null;
  return { period, margin, revenueYoy, marginYoyBps };
}

export const numericActive = (s: Screen) =>
  s.minMargin != null || s.minGrowth != null || s.minMarginChange != null || s.sort !== "default";
export const activeCount = (s: Screen) =>
  [s.sector, s.minMargin, s.minGrowth, s.minMarginChange].filter((x) => x !== "" && x != null).length + (s.sort !== "default" ? 1 : 0);

type Row = { symbol: string; name: string; shortName: string; sector: string; quarters?: Compact };

/** Search matches symbol, name or sector; a numeric minimum hides companies without that number. */
export function matches(r: Row, s: Screen): boolean {
  const t = s.text.trim().toLowerCase();
  if (t && ![r.symbol, r.name, r.shortName, r.sector].some((x) => x.toLowerCase().includes(t))) return false;
  if (s.sector && r.sector !== s.sector) return false;
  const m = metricsOf(r.quarters);
  const atLeast = (v: number | null | undefined, min: number | null) => min == null || (v != null && v >= min);
  return atLeast(m?.margin, s.minMargin) && atLeast(m?.revenueYoy, s.minGrowth) && atLeast(m?.marginYoyBps, s.minMarginChange);
}

/** Highest first for the chosen number; companies without it go last. "default" keeps the given order. */
export function sortRows<T extends Row>(rows: T[], sort: Screen["sort"]): T[] {
  if (sort === "default") return rows;
  const key = (r: T) => {
    const m = metricsOf(r.quarters);
    return sort === "margin" ? m?.margin : sort === "growth" ? m?.revenueYoy : m?.marginYoyBps;
  };
  return [...rows].sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
}
