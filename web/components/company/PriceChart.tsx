"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Link from "next/link";
import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { copy } from "@/lib/copy";
import { inr } from "@/lib/format";
import type { PriceMark, PriceMarkKind, PriceSeries } from "@/lib/priceChart";

const W = 300, H = 120, LANE = 30, PAD_X = 7;
const day = (d: string, year = false) =>
  new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Kolkata" });

/** Marks differ by shape, not only colour: results ◆, earnings call ○, FINN alert ▲. */
function Mark({ kind, x, y, r = 4.5 }: { kind: PriceMarkKind; x: number; y: number; r?: number }) {
  if (kind === "results") return <rect x={x - r * 0.8} y={y - r * 0.8} width={r * 1.6} height={r * 1.6} transform={`rotate(45 ${x} ${y})`} className="fill-accent stroke-surface" strokeWidth={1.5} />;
  if (kind === "call") return <circle cx={x} cy={y} r={r * 0.85} className="fill-surface stroke-ink-2" strokeWidth={1.75} />;
  return <path d={`M${x} ${y - r} L${x + r} ${y + r * 0.8} L${x - r} ${y + r * 0.8} Z`} className="fill-ink stroke-surface" strokeWidth={1.5} strokeLinejoin="round" />;
}

function Key({ kind }: { kind: PriceMarkKind }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden><Mark kind={kind} x={6} y={6} r={4} /></svg>
      {copy.price.kinds[kind]}
    </span>
  );
}

/**
 * A year of end-of-day closes as one line, with the dated things FINN knows about marked in a lane
 * under it. Tap or drag across the chart (or use the arrow keys) to read a day; the latest day is
 * shown first. Not a live price: the snapshot's closes only.
 */
export default function PriceChart({ s }: { s: PriceSeries }) {
  const pts = s.points;
  const n = pts.length;
  const [sel, setSel] = useState(n - 1);
  const svg = useRef<SVGSVGElement>(null);

  const closes = pts.map(([, c]) => c);
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const pad = (hi - lo) * 0.08 || 1;
  const y = (v: number) => 6 + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 12);
  const x = (i: number) => PAD_X + (i / Math.max(1, n - 1)) * (W - 2 * PAD_X);
  const index = new Map(pts.map(([d], i) => [d, i]));
  const line = pts.map(([, c], i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(" ");

  // Month ticks: the first session of every third month, from the first full month.
  const ticks = pts.flatMap(([d], i) => (i > 0 && d.slice(5, 7) !== pts[i - 1][0].slice(5, 7) && ["01", "04", "07", "10"].includes(d.slice(5, 7)) ? [i] : []));

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const f = ((e.clientX - r.left) / r.width) * W;
    setSel(Math.max(0, Math.min(n - 1, Math.round(((f - PAD_X) / (W - 2 * PAD_X)) * (n - 1)))));
  };
  const keys = (e: KeyboardEvent) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -n : e.key === "End" ? n : 0;
    if (!step) return;
    e.preventDefault();
    setSel((i) => Math.max(0, Math.min(n - 1, i + step)));
  };

  const [d, c] = pts[sel];
  const onDay = s.marks.filter((m) => m.day === d);
  const yearChange = { value: ((closes[n - 1] - closes[0]) / closes[0]) * 100, kind: "pct" as const, epistemic: "CALCULATED" as const,
    formula: `(close on ${day(pts[n - 1][0], true)} − close on ${day(pts[0][0], true)}) ÷ close on ${day(pts[0][0], true)}` };
  const kinds = (["results", "call", "alert"] as const).filter((k) => s.marks.some((m) => m.kind === k));
  const summary = copy.price.summary(day(pts[0][0], true), inr(closes[0]), day(pts[n - 1][0], true), inr(closes[n - 1]), inr(lo), inr(hi), s.marks.length);

  return (
    <div>
      <p className="text-[13px] text-ink-2">
        {copy.price.overYear} <Num v={yearChange} /> <span className="text-ink-3">· {copy.price.range(inr(lo), inr(hi))}</span>
      </p>

      <svg ref={svg} viewBox={`0 0 ${W} ${H + LANE}`} role="img" aria-label={summary} tabIndex={0} onKeyDown={keys}
        onPointerDown={pick} onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") pick(e); }}
        className="mt-2 block h-auto w-full touch-pan-y select-none rounded-[4px] outline-offset-2">
        <line x1={0} x2={W} y1={y(hi)} y2={y(hi)} className="stroke-line" strokeWidth={1} strokeDasharray="2 3" />
        <line x1={0} x2={W} y1={y(lo)} y2={y(lo)} className="stroke-line" strokeWidth={1} strokeDasharray="2 3" />
        <text x={2} y={y(hi) - 3} fontSize={9} className="fill-ink-3">{inr(hi)}</text>
        <text x={2} y={y(lo) + 10} fontSize={9} className="fill-ink-3">{inr(lo)}</text>
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-line" strokeWidth={1} />
        {ticks.map((i) => <line key={i} x1={x(i)} x2={x(i)} y1={H} y2={H + 3} className="stroke-ink-3" strokeWidth={1} />)}
        <path d={line} fill="none" className="stroke-ink-2" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        {/* crosshair on the selected day */}
        <line x1={x(sel)} x2={x(sel)} y1={0} y2={H + LANE} className="stroke-ink-3" strokeWidth={1} />
        <circle cx={x(sel)} cy={y(c)} r={4} className="fill-ink stroke-surface" strokeWidth={2} />
        {/* event lane: one mark per kind per day */}
        {s.marks.filter((m, i, all) => all.findIndex((o) => o.day === m.day && o.kind === m.kind) === i).map((m) => {
          const i = index.get(m.day)!;
          const row = m.kind === "results" ? 0 : m.kind === "call" ? 1 : 2;
          return <g key={`${m.kind}-${m.day}`} aria-hidden><Mark kind={m.kind} x={x(i)} y={H + 7 + row * 8.5} r={3.8} /></g>;
        })}
      </svg>
      <div aria-hidden className="relative mt-0.5 h-4 text-[11px] text-ink-3">
        {ticks.map((i) => (
          <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(i) / W) * 100}%` }}>
            {new Date(`${pts[i][0]}T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" })}
          </span>
        ))}
      </div>

      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">{kinds.map((k) => <Key key={k} kind={k} />)}</p>

      {/* readout for the selected day */}
      <div aria-live="polite" className="mt-2 rounded-[8px] bg-surface p-3 text-[13px]">
        <p><span className="font-medium text-ink">{day(d, true)}</span> · {copy.price.close} <span className="tabular font-medium">{inr(c)}</span></p>
        {onDay.length > 0 && (
          <ul className="mt-1 space-y-1">
            {onDay.map((m) => <MarkLine key={`${m.kind}-${m.label}`} m={m} />)}
          </ul>
        )}
      </div>

      <details className="mt-3 rounded-[8px] border border-line">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13px] font-medium text-ink-2">{copy.price.allMarks(s.marks.length)}</summary>
        <ul className="px-3 pb-2">
          {s.marks.map((m) => (
            <li key={`${m.kind}-${m.day}-${m.label}`}>
              <button type="button" onClick={() => setSel(index.get(m.day)!)}
                className="flex min-h-11 w-full items-center gap-2 text-left text-[13px]">
                <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden className="shrink-0"><Mark kind={m.kind} x={6} y={6} r={4} /></svg>
                <span className="min-w-0 flex-1">{m.label}</span>
                <span className="shrink-0 text-ink-3">{day(m.on, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-2 text-[11px] leading-4 text-ink-3">{copy.price.note}</p>
      <SourceLink s={s.source} oneLine />
    </div>
  );
}

function MarkLine({ m }: { m: PriceMark }) {
  return (
    <li className="flex items-start gap-2">
      <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden className="mt-0.5 shrink-0"><Mark kind={m.kind} x={6} y={6} r={4} /></svg>
      <span className="min-w-0">
        {m.label}{m.on !== m.day && <span className="text-ink-3"> · {copy.price.onDay(day(m.on))}</span>}
        {m.href && <> · <Link href={m.href} className="font-medium text-accent underline underline-offset-4">{copy.price.openBrief}</Link></>}
      </span>
    </li>
  );
}
