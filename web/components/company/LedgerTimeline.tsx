"use client";

import { Check, CircleDashed, CircleHelp, Clock, RefreshCw, X } from "lucide-react";
import { copy } from "@/lib/copy";
import { period as fmtPeriod } from "@/lib/format";
import { useSheetNav } from "@/lib/sheet";
import type { LedgerPromise, PromiseStatus } from "@/lib/types";

const STYLE: Record<PromiseStatus, { Icon: typeof Check; text: string; bar: string; fill: string; dash?: string }> = {
  delivered: { Icon: Check, text: "text-supports", bar: "stroke-supports", fill: "fill-supports" },
  on_track: { Icon: Clock, text: "text-supports", bar: "stroke-supports", fill: "fill-none" },
  at_risk: { Icon: CircleDashed, text: "text-contradicts", bar: "stroke-contradicts", fill: "fill-none", dash: "4 2" },
  missed: { Icon: X, text: "text-contradicts", bar: "stroke-contradicts", fill: "fill-contradicts" },
  revised: { Icon: RefreshCw, text: "text-unclear", bar: "stroke-unclear", fill: "fill-[url(#ledger-stripes)]" },
  unverifiable: { Icon: CircleHelp, text: "text-ink-3", bar: "stroke-ink-3", fill: "fill-none", dash: "1 3" },
};

/** "Q3FY27" → 31 Dec 2026, "FY27" → 31 Mar 2027, "H1FY27" → 30 Sep 2026; null when unspecified. */
export function deadlineDate(p: string): Date | null {
  const fy = p.match(/FY(\d{2})$/)?.[1];
  if (!fy) return null;
  const y = 2000 + Number(fy);
  const q = p.match(/^Q([1-4])/)?.[1], h = p.match(/^H([12])/)?.[1];
  const end = q ? ["", `${y - 1}-06-30`, `${y - 1}-09-30`, `${y - 1}-12-31`, `${y}-03-31`][Number(q)]
    : h ? (h === "1" ? `${y - 1}-09-30` : `${y}-03-31`) : `${y}-03-31`;
  return new Date(`${end}T00:00:00+05:30`);
}

/**
 * Promised vs delivered over time: one row per promise, bar from when it was said to its deadline.
 * Status is icon + word + colour + bar pattern (solid, outline, dashed, striped, dotted). Tap → quote.
 */
export default function LedgerTimeline({ promises, asOf }: { promises: LedgerPromise[]; asOf: string }) {
  const { open } = useSheetNav();
  const said = promises.map((p) => new Date(p.saidAt).getTime());
  const ends = promises.map((p) => deadlineDate(p.deadline)?.getTime() ?? new Date(p.saidAt).getTime() + 90 * 864e5);
  const t0 = Math.min(...said), t1 = Math.min(Math.max(...ends, new Date(asOf).getTime()), new Date("2028-03-31").getTime());
  const x = (t: number) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));
  const now = x(new Date(asOf).getTime());

  return (
    <div>
      <ul className="space-y-1">
        {promises.map((p, i) => {
          const s = STYLE[p.status];
          const end = deadlineDate(p.deadline);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => open("quote", { promise: p.id })}
                className="w-full rounded-[8px] px-1 py-1.5 text-left hover:bg-bg">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-medium">
                    {copy.ledger.metric[p.metric] ?? p.metric}{p.scope !== "company" && <span className="font-normal text-ink-3"> · {p.scope}</span>}
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${s.text}`}>
                    <s.Icon size={12} aria-hidden /> {copy.ledger.status[p.status]}
                  </span>
                </span>
                <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="mt-1 h-2.5 w-full overflow-visible" aria-hidden>
                  <line x1={0} x2={100} y1={5} y2={5} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <rect x={x(said[i])} y={1} width={Math.max(1.5, x(ends[i]) - x(said[i]))} height={8} rx={2}
                    className={`${s.fill} ${s.bar}`} strokeWidth={1.5} strokeDasharray={end ? s.dash : "1 3"}
                    vectorEffect="non-scaling-stroke" />
                  <line x1={now} x2={now} y1={-2} y2={12} className="stroke-accent" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="mt-0.5 block text-[11px] text-ink-3">
                  {copy.ledger.said(new Date(p.saidAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" }))}
                  {" · "}{end ? copy.ledger.due(fmtPeriod(p.deadline)) : copy.ledger.noDeadline}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <pattern id="ledger-stripes" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="4" className="fill-unclear" />
          </pattern>
        </defs>
      </svg>
      <p className="mt-2 text-[11px] leading-4 text-ink-3">{copy.ledger.legend}</p>
    </div>
  );
}
