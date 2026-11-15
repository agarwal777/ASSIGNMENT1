"use client";

import { useState, useSyncExternalStore } from "react";
import { CitationChip } from "@/components/trust/SourceLink";
import { copy } from "@/lib/copy";
import { date, time } from "@/lib/format";
import type { SourceRef } from "@/lib/types";
import { useNdjsonStream } from "@/lib/useNdjsonStream";

type Sentence = { text: string; citations: SourceRef[] };
type Result = { generatedAt: string; bear: Sentence[]; bull: Sentence[] };
type Ev = { type: "section"; side: "bear" | "bull"; text: string; citations: SourceRef[] }
  | { type: "side_done"; side: "bear" | "bull"; kept: number } | { type: "done" } | { type: "error"; message: string };

// The last result per company, kept on this device (storage may be blocked: every access is wrapped).
const key = (s: string) => `finn.bullbear.${s}`;
const listeners = new Set<() => void>();
const read = (s: string) => { try { return window.localStorage.getItem(key(s)); } catch { return null; } };
const write = (s: string, r: Result) => {
  try { window.localStorage.setItem(key(s), JSON.stringify(r)); } catch { /* not kept; still shown */ }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Bull vs bear from primary sources, every sentence cited; Bear streams first. */
export default function BullBear({ symbol }: { symbol: string }) {
  const stored = useSyncExternalStore(subscribe, () => read(symbol), () => null);
  const saved: Result | null = (() => { try { return stored ? JSON.parse(stored) : null; } catch { return null; } })();
  const [live, setLive] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stream = useNdjsonStream<Ev>();
  const shown = live ?? saved;
  const b = copy.bullBear;

  const run = () => {
    const acc: Result = { generatedAt: new Date().toISOString(), bear: [], bull: [] };
    setLive({ ...acc });
    setError(null);
    stream.start("/api/bull-bear", { symbol }, (e) => {
      if (e.type === "section") { acc[e.side] = [...acc[e.side], { text: e.text, citations: e.citations }]; setLive({ ...acc }); }
      if (e.type === "done") { write(symbol, acc); setLive(null); }
      // Keep what already arrived (usually the bear side) and say what failed; nothing partial is stored.
      if (e.type === "error") setError(e.message);
    }, (msg) => setError(msg));
  };

  // One number per distinct source across both sides, so the same document keeps the same chip.
  const nums = new Map<string, number>();
  const n = (s: SourceRef) => { const k = `${s.documentId}#${s.page ?? ""}`; if (!nums.has(k)) nums.set(k, nums.size + 1); return nums.get(k)!; };

  return (
    <div>
      {!shown && !stream.running && (
        <button type="button" onClick={run}
          className="flex min-h-11 w-full items-center justify-center rounded-[8px] border border-accent px-3 text-[15px] font-medium text-accent">
          {b.build}
        </button>
      )}
      {(shown || stream.running) && (
        <div className="space-y-4">
          {(["bear", "bull"] as const).map((side) => {
            const list = shown?.[side] ?? [];
            const pending = stream.running && (side === "bear" ? list.length === 0 : (shown?.bull.length ?? 0) === 0);
            // After a failure, an empty side was never written: show nothing rather than "no point supported".
            if (!list.length && !pending && error) return null;
            return (
              <section key={side} aria-label={b[side]} className="rounded-[12px] border border-line bg-surface p-3">
                <h3 className="text-[13px] font-medium text-ink-2">{b[side]}</h3>
                {list.length > 0 ? (
                  <ul className="mt-1 space-y-1.5">
                    {list.map((s, i) => (
                      <li key={i} className="text-[15px] leading-[22px]">
                        {s.text}{s.citations.map((c) => <CitationChip key={c.documentId + (c.page ?? "")} n={n(c)} s={c} />)}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-[13px] text-ink-3">{pending ? b.writing : b.nothing}</p>}
              </section>
            );
          })}
          {!stream.running && shown && !error && (
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
              <span>{b.generated(`${date(shown.generatedAt)}, ${time(shown.generatedAt)}`)}</span>
              <span aria-hidden>·</span>
              <button type="button" onClick={run} className="min-h-11 font-medium text-accent">{b.refresh}</button>
            </p>
          )}
        </div>
      )}
      {error && !stream.running && (
        <p role="alert" className="mt-2 flex flex-wrap items-center gap-x-2 text-[13px] text-contradicts">
          <span>{b.failed(error)}</span>
          <button type="button" onClick={run} className="min-h-11 font-medium text-accent">{b.retry}</button>
        </p>
      )}
      <p className="mt-2 text-[12px] leading-4 text-ink-3">{b.note}</p>
    </div>
  );
}
