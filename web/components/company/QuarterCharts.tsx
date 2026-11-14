"use client";

import { useState } from "react";
import Num from "@/components/trust/Num";
import { copy } from "@/lib/copy";
import { formatValue, period as fmtPeriod } from "@/lib/format";
import type { QuarterRow } from "@/lib/types";

const W = 300, H = 64, PAD = 4;

/**
 * Small multiples over the same quarters: revenue as bars (from zero), EBITDA margin as a line. Tap a
 * quarter (on either chart or its label) to see that quarter's numbers; the latest is selected first.
 */
export default function QuarterCharts({ rows }: { rows: QuarterRow[] }) {
  const [sel, setSel] = useState(rows.length - 1);
  const q = rows[sel];
  const step = (W - 2 * PAD) / rows.length;
  const cx = (i: number) => PAD + step * (i + 0.5);

  const rev = rows.map((r) => r.revenue?.value ?? null);
  const revMax = Math.max(...rev.map((v) => v ?? 0)) || 1;
  const mar = rows.map((r) => r.ebitdaMargin?.value ?? null);
  const mv = mar.filter((v): v is number => v != null);
  const span = (Math.max(...mv) - Math.min(...mv)) || 1;
  const mLo = Math.min(...mv) - span * 0.4, mHi = Math.max(...mv) + span * 0.4;
  const my = (v: number) => H - 6 - ((v - mLo) / (mHi - mLo)) * (H - 16);
  const list = (vals: (number | null)[], kind: "inr_cr" | "pct") =>
    rows.map((r, i) => `${fmtPeriod(r.period)} ${vals[i] == null ? copy.card.notAvailable : formatValue(kind, vals[i]!, false)}`).join(", ");

  return (
    <div>
      <figure className="m-0">
        <figcaption className="text-[13px] text-ink-3">{copy.metric.revenue}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${copy.metric.revenue}: ${list(rev, "inr_cr")}`} className="mt-1 block h-auto w-full">
          <line x1={0} x2={W} y1={H - 1} y2={H - 1} className="stroke-line" strokeWidth={1} />
          {rev.map((v, i) => v != null && (
            <rect key={rows[i].period} x={cx(i) - step * 0.3} width={step * 0.6} y={H - 1 - (v / revMax) * (H - 8)} height={(v / revMax) * (H - 8)}
              rx={3} onClick={() => setSel(i)} className={`cursor-pointer ${i === sel ? "fill-ink" : "fill-ink-3/45"}`} />
          ))}
        </svg>
      </figure>

      <figure className="m-0 mt-3">
        <figcaption className="text-[13px] text-ink-3">{copy.metric.ebitda_margin}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${copy.metric.ebitda_margin}: ${list(mar, "pct")}`} className="mt-1 block h-auto w-full">
          <polyline points={mar.flatMap((v, i) => (v == null ? [] : [`${cx(i)},${my(v)}`])).join(" ")} fill="none"
            className="stroke-ink-2" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {mar.map((v, i) => v != null && (
            <circle key={rows[i].period} cx={cx(i)} cy={my(v)} r={i === sel ? 5 : 3.5} onClick={() => setSel(i)}
              className={`cursor-pointer stroke-surface ${i === sel ? "fill-ink" : "fill-ink-2"}`} strokeWidth={2} />
          ))}
        </svg>
      </figure>

      {/* The quarter labels are the keyboard and touch targets for the selection. */}
      <div role="group" aria-label={copy.company.pickQuarter} className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r, i) => (
          <button key={r.period} type="button" aria-pressed={i === sel} onClick={() => setSel(i)}
            className={`min-h-11 rounded-[6px] text-center text-[11px] leading-4 ${i === sel ? "bg-accent/10 font-medium text-accent" : "text-ink-3"}`}>
            {r.period.slice(0, 2)}<br />{r.period.slice(2)}
          </button>
        ))}
      </div>

      <dl aria-live="polite" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-[8px] bg-surface p-3 text-[13px]">
        <dt className="col-span-2 text-[13px] font-medium text-ink">{fmtPeriod(q.period)}</dt>
        <Item label={copy.metric.revenue} v={q.revenue} signed={false} />
        <Item label={copy.company.revenueYoy} v={q.revenueYoy} signed />
        <Item label={copy.metric.ebitda_margin} v={q.ebitdaMargin} signed={false} />
        <Item label={copy.metric.pat} v={q.pat} signed={false} />
      </dl>
    </div>
  );
}

function Item({ label, v, signed }: { label: string; v?: QuarterRow["revenue"]; signed: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-[15px] font-medium">{v ? <Num v={v} signed={signed} /> : "—"}</dd>
    </div>
  );
}
