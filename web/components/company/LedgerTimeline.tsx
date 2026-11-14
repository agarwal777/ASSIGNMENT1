"use client";

import { copy } from "@/lib/copy";
import { period as fmtPeriod } from "@/lib/format";
import { useSheetNav } from "@/lib/sheet";
import { STATUS, STATUS_ORDER } from "@/lib/status";
import StatusPill from "@/components/trust/StatusPill";
import type { LedgerPromise } from "@/lib/types";

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

const n = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
/** "20–21%", "at least 21%" (a single percent is read as a floor, as the ledger judges it), "USD 200 million". */
function target(p: LedgerPromise): string {
  const g = p.guided;
  if (!g || (g.low == null && g.high == null)) return copy.ledger.noTarget;
  const pctUnit = g.unit === "percent";
  const lo = g.low ?? g.high!, hi = g.high ?? g.low!;
  const value = lo !== hi ? `${n(lo)}–${n(hi)}` : n(lo);
  if (pctUnit) return lo !== hi ? `${value}%` : `at least ${value}%`;
  const [cur, ...rest] = g.unit.split(" ");
  return ["USD", "EUR", "INR"].includes(cur) ? `${cur} ${value} ${rest.join(" ")}` : `${value} ${g.unit}`;
}
const month = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

type Group = { key: string; items: LedgerPromise[]; latest: LedgerPromise };

/** Statements on the same metric, scope and deadline are one promise with a history. */
function group(promises: LedgerPromise[]): Group[] {
  const by = new Map<string, LedgerPromise[]>();
  for (const p of promises) {
    const k = `${p.metric}|${p.scope}|${p.deadline}`;
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return [...by.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => a.saidAt.localeCompare(b.saidAt));
    return { key, items: sorted, latest: sorted[sorted.length - 1] };
  }).sort((a, b) => STATUS_ORDER.indexOf(a.latest.status) - STATUS_ORDER.indexOf(b.latest.status)
    || a.items[0].saidAt.localeCompare(b.items[0].saidAt));
}

/**
 * Promised vs delivered: checkable promises first, each with its statements over time (first said,
 * reiterated, revised) and a bar from when it was first said to its deadline. A revised target shows
 * the latest target's status. Promises that can't be checked yet sit behind a disclosure.
 */
export default function LedgerTimeline({ promises, asOf }: { promises: LedgerPromise[]; asOf: string }) {
  const groups = group(promises);
  const checkable = groups.filter((g) => g.latest.status !== "cant_check");
  const later = groups.filter((g) => g.latest.status === "cant_check");
  const said = promises.map((p) => new Date(p.saidAt).getTime());
  const ends = promises.map((p) => deadlineDate(p.deadline)?.getTime() ?? new Date(p.saidAt).getTime() + 90 * 864e5);
  const t0 = Math.min(...said), t1 = Math.min(Math.max(...ends, new Date(asOf).getTime()), new Date("2028-03-31").getTime());
  const x = (t: number) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0 || 1)) * 100));
  const scale = { x, now: x(new Date(asOf).getTime()) };

  return (
    <div>
      {checkable.length > 0
        ? <ul className="space-y-1">{checkable.map((g) => <Row key={g.key} g={g} scale={scale} />)}</ul>
        : <p className="text-[15px] text-ink-2">{copy.ledger.noneCheckable}</p>}
      {later.length > 0 && (
        <details className="mt-3 rounded-[8px] border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13px] font-medium text-ink-2">
            {copy.ledger.cantCheck(later.length)}
          </summary>
          <ul className="space-y-1 px-2 pb-2">{later.map((g) => <Row key={g.key} g={g} scale={scale} />)}</ul>
        </details>
      )}
      <p className="mt-2 text-[11px] leading-4 text-ink-3">{copy.ledger.legend}</p>
    </div>
  );
}

function Row({ g, scale }: { g: Group; scale: { x: (t: number) => number; now: number } }) {
  const { open } = useSheetNav();
  const p = g.latest;
  const end = deadlineDate(p.deadline);
  const a = scale.x(new Date(g.items[0].saidAt).getTime());
  const b = scale.x(end?.getTime() ?? new Date(p.saidAt).getTime() + 90 * 864e5);
  const s = STATUS[p.status];
  const solid = p.status === "met" || p.status === "missed";
  return (
    <li className="rounded-[8px] px-1 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => open("quote", { promise: p.id })} className="min-h-11 min-w-0 text-left">
          <span className="block text-[15px] font-medium leading-5">
            {copy.ledger.metric[p.metric] ?? p.metric}
            {p.scope !== "company" && <span className="font-normal text-ink-3"> · {p.scope}</span>}
          </span>
          <span className="block text-[13px] text-ink-2">
            {target(p)} · {end ? copy.ledger.due(fmtPeriod(p.deadline)) : copy.ledger.noDeadline}
          </span>
        </button>
        <StatusPill status={p.status} />
      </div>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="mt-1 h-2.5 w-full overflow-visible" aria-hidden>
        <line x1={0} x2={100} y1={5} y2={5} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <rect x={a} y={1.5} width={Math.max(1.5, b - a)} height={7} rx={2}
          className={`${solid ? s.fill : "fill-none"} ${s.stroke}`} strokeWidth={1.5}
          strokeDasharray={p.status === "cant_check" ? "1 3" : p.status === "behind" ? "4 2" : undefined} vectorEffect="non-scaling-stroke" />
        <line x1={scale.now} x2={scale.now} y1={-2} y2={12} className="stroke-accent" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-1 text-[12px] leading-[18px] text-ink-3">
        {g.items.map((it, i) => {
          const prev = g.items[i - 1];
          const what = !prev ? copy.ledger.said(month(it.saidAt))
            : target(it) === target(prev) ? copy.ledger.reiterated(month(it.saidAt))
            : copy.ledger.revised(month(it.saidAt), target(it));
          return (
            <span key={it.id} className="inline-flex items-center">
              {i > 0 && <span aria-hidden className="mr-1">→</span>}
              <button type="button" onClick={() => open("quote", { promise: it.id })}
                className="min-h-8 underline decoration-line underline-offset-4">{what}</button>
            </span>
          );
        })}
      </p>
    </li>
  );
}
