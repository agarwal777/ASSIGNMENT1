import { claimAria, claimCaption } from "@/lib/claims";
import { STATUS } from "@/lib/status";
import type { Claim } from "@/lib/types";

/**
 * Bullet chart for one checkable claim: a track, a bar for the actual so far (in the claim's status
 * colour, the only coloured mark), a vertical tick for the target (a shaded band for a range), and
 * the caption underneath. The scale starts at zero so bar length stays honest.
 */
export default function BulletChart({ claim, label }: { claim: Claim; label: string }) {
  const hi = claim.targetHigh ?? claim.target;
  const a = claim.actual;
  const lo = Math.min(0, a ?? 0);
  const max = Math.max(hi, a ?? 0) * 1.15 || 1;
  const x = (n: number) => `${((n - lo) / (max - lo)) * 100}%`;
  const s = STATUS[claim.status];
  return (
    <figure role="img" aria-label={claimAria(claim, label)} className="m-0">
      <div className="relative h-3 rounded-full bg-line/70" aria-hidden>
        {claim.targetHigh != null && (
          <div className="absolute inset-y-0 bg-ink-3/20" style={{ left: x(claim.target), width: `calc(${x(hi)} - ${x(claim.target)})` }} />
        )}
        {a != null && (
          <div className={`absolute inset-y-0.5 rounded-full ${s.bar}`}
            style={{ left: x(Math.min(a, 0)), width: `calc(${x(Math.max(a, 0))} - ${x(Math.min(a, 0))})` }} />
        )}
        {lo < 0 && <div className="absolute inset-y-0 w-px bg-ink-3" style={{ left: x(0) }} />}
        <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: x(claim.target) }} />
        {claim.targetHigh != null && (
          <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: x(hi) }} />
        )}
      </div>
      <figcaption className="mt-1.5 text-[13px] leading-[18px] text-ink-2">{claimCaption(claim)}</figcaption>
    </figure>
  );
}
