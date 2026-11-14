"use client";

import { useEffect, useRef } from "react";
import { copy } from "@/lib/copy";

const IST = "Asia/Kolkata";
const fmt = (day: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T08:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: IST, ...o });

/**
 * Brief dates as a horizontally scrollable strip, about seven visible at 375 px. Each day shows its
 * weekday, date and a dot with the number of "needs you" cards in that day's 24-hour brief.
 */
export default function DayStrip({ days, counts, selected, onPick }: {
  days: string[]; counts: Record<string, number>; selected: string; onPick: (day: string) => void;
}) {
  const sel = useRef<HTMLButtonElement>(null);
  useEffect(() => { sel.current?.scrollIntoView({ block: "nearest", inline: "center" }); }, [selected]);
  return (
    <div role="group" aria-label={copy.today.days} className="flex gap-1 overflow-x-auto px-2 py-1 [scrollbar-width:none]">
      {days.map((d) => {
        const on = d === selected, n = counts[d] ?? 0;
        return (
          <button key={d} ref={on ? sel : undefined} type="button" aria-pressed={on} onClick={() => onPick(d)}
            aria-label={copy.today.dayLabel(fmt(d, { day: "numeric", month: "short" }), n)}
            className={`flex min-h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[10px] ${
              on ? "bg-accent text-surface" : "text-ink-2"}`}>
            <span className="text-[11px] leading-4">{fmt(d, { weekday: "short" })}</span>
            <span className="text-[15px] font-medium leading-5">{fmt(d, { day: "numeric" })}</span>
            <span aria-hidden className={`mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ${
              n === 0 ? "invisible" : on ? "bg-surface text-accent" : "bg-accent text-surface"}`}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}
