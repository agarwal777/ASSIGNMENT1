import { copy } from "@/lib/copy";
import { formatValue, period as fmtPeriod } from "@/lib/format";
import type { Trend } from "@/lib/types";

const W = 300, H = 84, PAD_X = 18, TOP = 18, BOTTOM = 66;

/**
 * The key metric over the last 3–5 quarters, hand-written SVG. Revenue is drawn as bars from zero
 * (length = amount); a margin as a line (level). Only the latest value is labelled on the chart;
 * every value is in the aria-label and in each point's tooltip.
 */
export default function TrendChart({ trend }: { trend: Trend }) {
  const pts = trend.points;
  const fmt = (v: number) => formatValue(trend.kind, v, false);
  const vals = pts.map((p) => p.value);
  const bars = trend.metric === "revenue";
  const lo = bars ? 0 : Math.min(...vals) - (Math.max(...vals) - Math.min(...vals) || 1) * 0.3;
  const hi = Math.max(...vals) + (bars ? 0 : (Math.max(...vals) - Math.min(...vals) || 1) * 0.3);
  const step = (W - 2 * PAD_X) / pts.length;
  const cx = (i: number) => PAD_X + step * (i + 0.5);
  const y = (v: number) => BOTTOM - ((v - lo) / (hi - lo || 1)) * (BOTTOM - TOP);
  const last = pts.length - 1;
  const label = copy.card.trendLabel(trend.label, fmtPeriod(pts[0].period), fmtPeriod(pts[last].period),
    pts.map((p) => `${fmtPeriod(p.period)} ${fmt(p.value)}`).join(", "));

  return (
    <figure className="m-0 mt-3">
      <figcaption className="text-[13px] text-ink-3">{copy.card.trendTitle(trend.label, pts.length)}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mt-1 block h-auto w-full">
        <line x1={PAD_X} x2={W - PAD_X} y1={BOTTOM} y2={BOTTOM} className="stroke-line" strokeWidth={1} />
        {bars ? pts.map((p, i) => (
          <rect key={p.period} x={cx(i) - step * 0.28} width={step * 0.56} y={y(p.value)} height={BOTTOM - y(p.value)} rx={3}
            className={i === last ? "fill-ink" : "fill-ink-3/45"}>
            <title>{`${fmtPeriod(p.period)}: ${fmt(p.value)}`}</title>
          </rect>
        )) : (
          <>
            <polyline points={pts.map((p, i) => `${cx(i)},${y(p.value)}`).join(" ")} fill="none" className="stroke-ink-2"
              strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={p.period} cx={cx(i)} cy={y(p.value)} r={i === last ? 4.5 : 3}
                className={i === last ? "fill-ink stroke-surface" : "fill-ink-2 stroke-surface"} strokeWidth={2}>
                <title>{`${fmtPeriod(p.period)}: ${fmt(p.value)}`}</title>
              </circle>
            ))}
          </>
        )}
        <text x={Math.min(cx(last), W - 4)} y={y(pts[last].value) - 7} textAnchor="end" className="fill-ink text-[11px] font-medium">
          {fmt(pts[last].value)}
        </text>
        {pts.map((p, i) => (
          <text key={p.period} x={cx(i)} y={H - 4} textAnchor="middle" className="fill-ink-3 text-[10px]">
            {fmtPeriod(p.period)}
          </text>
        ))}
      </svg>
    </figure>
  );
}
