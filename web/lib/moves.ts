// Price/volume moves, re-scored on the device with the investor's own thresholds.
// Mirrors workers/alerts.py (detect, "unexplained") and the move scoring in workers/build_digest.py;
// web/scripts/moves.test.mjs checks that the default thresholds reproduce the committed digest exactly.
import type { DigestEvent } from "@/lib/digest";

export type Thresholds = { volumeMultiple: number; priceMovePct: number };
export const DEFAULT_THRESHOLDS: Thresholds = { volumeMultiple: 2.0, priceMovePct: 5.0 };
export const THRESHOLD_LIMITS = { volume: { min: 1.2, step: 0.1 }, price: { min: 0.5, step: 0.5 } };

export type MovesData = {
  window_start: string | null; alerts_from: string;
  names: Record<string, string>; sector: Record<string, string | null>;
  series: Record<string, [string, number, number][]>;      // [date, close, volume], ascending
  filed_days: Record<string, string[]>;                     // days with any filing (incl. a year of history)
  filed_at: Record<string, string[]>;                       // filing timestamps (IST, no offset) in the window
};

const LOOKBACK = 20, NEEDS_YOU = 0.65, WORTH = 0.35, T_ANY = 0.4;
const round = (x: number, d: number) => Number(x.toFixed(d));
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Every move above the thresholds for the snapshot's portfolio, as digest events. */
export function moveEvents(data: MovesData, t: Thresholds): DigestEvent[] {
  const out: DigestEvent[] = [];
  for (const [sym, s] of Object.entries(data.series)) {
    const filed = new Set(data.filed_days[sym] ?? []);
    const filedAt = (data.filed_at[sym] ?? []).map((x) => Date.parse(`${x}Z`));
    for (let i = LOOKBACK; i < s.length; i++) {
      const [day, close, volume] = s[i], [prevDay, prevClose] = s[i - 1];
      if (day < data.alerts_from) continue;
      const avg = s.slice(i - LOOKBACK, i).reduce((a, r) => a + r[2], 0) / LOOKBACK;
      const volX = avg > 0 ? volume / avg : null;
      const ret = prevClose ? (100 * (close - prevClose)) / prevClose : null;
      const reasons: string[] = [];
      if (volX != null && volX > t.volumeMultiple) reasons.push(`volume ${volX.toFixed(1)}× its ${LOOKBACK}-day average`);
      if (ret != null && Math.abs(ret) > t.priceMovePct) reasons.push(`price ${ret >= 0 ? "+" : "-"}${Math.abs(ret).toFixed(1)}% on the day`);
      if (!reasons.length) continue;

      // A filing explains the move if it landed between the previous session and today, inclusive.
      let unexplained = false;
      if (data.window_start && prevDay >= data.window_start) {
        unexplained = true;
        for (let d = prevDay; d <= day; d = addDays(d, 1)) if (filed.has(d)) { unexplained = false; break; }
      }
      const vol = volX != null ? round(volX, 2) : null, r = ret != null ? round(ret, 2) : null;
      const big = Math.abs(r ?? 0) >= 10 || (vol ?? 0) >= 5;
      const m = unexplained ? 0.6 : big ? 0.5 : 0.35;
      const sScore = round(Math.min(Math.max((vol ?? 0) / 4, Math.abs(r ?? 0) / 10), 1), 2);
      const score = round((0.35 * m + 0.25 * sScore + 0.3 * T_ANY) / 0.9, 3);
      const closeAt = Date.parse(`${day}T15:30:00Z`);
      const before = filedAt.filter((x) => x <= closeAt);
      out.push({
        id: `${sym}-move-${day}`, symbol: sym, name: data.names[sym] ?? sym, sector: data.sector[sym] ?? null,
        kind: "move", category: unexplained ? "unexplained_move" : "price_volume",
        at: `${day}T15:30:00+05:30`, title: unexplained ? "Unexplained move" : "Price / volume move",
        summary: reasons.join("; "), url: null, related: [],
        move: { volume_multiple: vol, return_pct: r },
        volume30d: s.slice(Math.max(0, i - 29), i + 1).map((x) => x[2]),
        no_filing_hours: before.length ? Math.floor((closeAt - Math.max(...before)) / 3_600_000) : null,
        components: { M: m, S: sScore, T: T_ANY, N: null }, score,
        bucket: score >= NEEDS_YOU ? "needs_you" : score >= WORTH ? "worth_a_read" : "collapsed",
        reasons: unexplained ? [...reasons, "no filing since the previous session"] : reasons,
        thesis: [],
      });
    }
  }
  return out;
}
