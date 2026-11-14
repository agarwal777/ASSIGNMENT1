import { copy } from "@/lib/copy";
import { ratio } from "@/lib/format";

/** 30-day volume micro-bars, 40 px tall, hand-drawn SVG. Last bar (today) in the accent; dashed 20-day average. */
export default function VolumeStrip({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 300, H = 40, gap = 2;
  const max = Math.max(...values);
  const bw = (W - gap * (values.length - 1)) / values.length;
  const prior = values.slice(-21, -1);
  const avg = prior.reduce((a, b) => a + b, 0) / Math.max(prior.length, 1);
  const y = (v: number) => H - (v / max) * H;
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full" role="img"
        aria-label={copy.card.volumeStripLabel(ratio(values[values.length - 1] / Math.max(avg, 1e-9)))}>
        {values.map((v, i) => (
          <rect key={i} x={i * (bw + gap)} y={y(v)} width={bw} height={H - y(v)} rx={1}
            className={i === values.length - 1 ? "fill-accent" : "fill-ink-3/40"} />
        ))}
        <line x1={0} x2={W} y1={y(avg)} y2={y(avg)} className="stroke-ink-2" strokeWidth={1} strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-ink-3">
        <span>{copy.card.thirtyDays}</span><span>{copy.card.avgLine}</span>
      </figcaption>
    </figure>
  );
}
