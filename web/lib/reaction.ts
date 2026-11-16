// How a stock's closing price actually moved after a filing, and after its earlier filings of the same
// type. History, not a forecast: raw closes, not adjusted for the market, with the sample size shown.
//
// Timing rule: a filing made before 15:30 IST on a trading day can move that day's close; anything later
// (or on a holiday) first shows in the next trading day's close. The base is the close just before that.

export type Close = [day: string, close: number];
export type Move = { day: string; pct: number };
export type Reaction = {
  at: string;
  base: { day: string; close: number } | null;
  day1: Move | null;          // first close that could react
  day5: Move | null;          // five trading days in
  latest: (Move & { tradingDays: number }) | null;
};

const IST_MS = 5.5 * 3600_000;
const pct = (a: number, b: number) => Math.round(((b - a) / a) * 1000) / 10;

/** The first trading day whose close can reflect a filing made at `at` (ISO with offset). */
function reactionIndex(at: string, closes: Close[]): number {
  const ist = new Date(new Date(at).getTime() + IST_MS).toISOString();
  const day = ist.slice(0, 10), hhmm = ist.slice(11, 16);
  const sameDayCounts = hhmm < "15:30";
  return closes.findIndex(([d]) => d > day || (sameDayCounts && d === day));
}

export function reactionTo(at: string, closes: Close[]): Reaction {
  const i = reactionIndex(at, closes);
  const out: Reaction = { at, base: null, day1: null, day5: null, latest: null };
  if (i <= 0 && !(i === -1 && closes.length)) return out;           // no close before the filing in our data
  const b = i === -1 ? closes.length - 1 : i - 1;                     // -1: no trading day after it yet
  const [bd, bc] = closes[b];
  out.base = { day: bd, close: bc };
  if (i === -1) return out;
  out.day1 = { day: closes[i][0], pct: pct(bc, closes[i][1]) };
  if (closes[i + 4]) out.day5 = { day: closes[i + 4][0], pct: pct(bc, closes[i + 4][1]) };
  const last = closes.length - 1;
  out.latest = { day: closes[last][0], pct: pct(bc, closes[last][1]), tradingDays: last - b };
  return out;
}

/** Filing time from an NSE XBRL file name: "..._06112026085901_WEB.xml" → 2026-11-06T08:59:01+05:30. */
export function filedAtFromXbrl(url: string): string | null {
  const m = url.match(/_(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})(?:_[A-Z]+)?\.xml$/i);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30` : null;
}

/** Earlier filings' reactions, newest first; only those with a full 5-day window in our prices. */
export function pastReactions(ats: string[], closes: Close[], before: string): Reaction[] {
  const beforeDay = before.slice(0, 10);
  return [...new Set(ats)]
    .filter((a) => a.slice(0, 10) < beforeDay)
    .sort((a, b) => b.localeCompare(a))
    .map((a) => reactionTo(a, closes))
    .filter((r) => r.day1 && r.day5);
}
