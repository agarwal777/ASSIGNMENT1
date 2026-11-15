"use client";

import { useEffect, useState } from "react";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { CitationChip } from "@/components/trust/SourceLink";
import { copy } from "@/lib/copy";
import { date, time } from "@/lib/format";
import type { SourceRef } from "@/lib/types";
import { useNdjsonStream } from "@/lib/useNdjsonStream";

type Sentence = { text: string; citations: SourceRef[] };
type Side = "bear" | "bull";
type Result = { bear: Sentence[]; bull: Sentence[]; dropped: Record<Side, number>; done: Record<Side, boolean>;
  generatedAt?: string; refreshable?: boolean };
type Ev = { type: "section"; side: Side; text: string; citations: SourceRef[] }
  | { type: "side_done"; side: Side; kept: number; dropped: number }
  | { type: "done"; generatedAt: string; cached: boolean; refreshable: boolean }
  | { type: "none" } | { type: "error"; code?: string; message: string };

const empty = (): Result => ({ bear: [], bull: [], dropped: { bear: 0, bull: 0 }, done: { bear: false, bull: false } });

/** Fold one stream event into the result. */
function apply(r: Result, e: Ev): Result {
  if (e.type === "section") return { ...r, [e.side]: [...r[e.side], { text: e.text, citations: e.citations }] };
  if (e.type === "side_done") return { ...r, dropped: { ...r.dropped, [e.side]: e.dropped ?? 0 }, done: { ...r.done, [e.side]: true } };
  if (e.type === "done") return { ...r, generatedAt: e.generatedAt, refreshable: e.refreshable };
  return r;
}

/**
 * Bull vs bear from primary sources. The server keeps one validated result per company and evidence
 * (shared by every visitor); on load the page shows it if it exists. Building streams Bear, then Bull.
 */
export default function BullBear({ symbol }: { symbol: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [stopped, setStopped] = useState(false);
  const stream = useNdjsonStream<Ev>();
  const b = copy.bullBear;

  // Show the shared cached copy, if any, without generating anything.
  useEffect(() => {
    let live = true;
    fetch("/api/bull-bear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, peek: true }) })
      .then((r) => r.text())
      .then((t) => {
        const events = t.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Ev);
        if (live && events.some((e) => e.type === "done")) setResult(events.reduce(apply, empty()));
      })
      .catch(() => { /* the Build button still works */ });
    return () => { live = false; };
  }, [symbol]);

  const run = (refresh = false) => {
    let acc = empty();
    setResult(acc);
    setError(null);
    setStopped(false);
    stream.start("/api/bull-bear", { symbol, refresh }, (e) => {
      if (e.type === "error") { setError({ code: e.code, message: e.message }); return; }
      acc = apply(acc, e);
      setResult(acc);
    }, (msg) => setError({ message: msg }));
  };
  const stop = () => { stream.stop(); setStopped(true); };

  // One number per distinct source across both sides, so the same document keeps the same chip.
  const nums = new Map<string, number>();
  const n = (s: SourceRef) => { const k = `${s.documentId}#${s.page ?? ""}`; if (!nums.has(k)) nums.set(k, nums.size + 1); return nums.get(k)!; };
  const errorText = error && (error.code === "cap" ? b.cap : error.code === "busy" ? b.busy
    : error.code === "not_configured" ? b.notConfigured : b.failed(error.message));
  const dropped = result ? result.dropped.bear + result.dropped.bull : 0;

  return (
    <div>
      {!result && !stream.running && (
        <button type="button" onClick={() => run()}
          className="flex min-h-11 w-full items-center justify-center rounded-[8px] border border-accent px-3 text-[15px] font-medium text-accent">
          {b.build}
        </button>
      )}
      {result && (
        <div className="space-y-4">
          {(["bear", "bull"] as const).map((side) => {
            const list = result[side];
            const pending = stream.running && !result.done[side];
            if (!list.length && !pending && (error || stopped)) return null;
            return (
              <section key={side} aria-label={b[side]} className="rounded-[12px] border border-line bg-surface p-3">
                <h3 className="flex items-center justify-between text-[13px] font-medium text-ink-2">
                  {b[side]} <EpistemicTag e="INFERRED" />
                </h3>
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
          {stream.running && (
            <button type="button" onClick={stop} className="min-h-11 text-[15px] font-medium text-accent">{b.stop}</button>
          )}
          {!stream.running && result.generatedAt && !error && (
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
              <span>{b.generated(`${date(result.generatedAt)}, ${time(result.generatedAt)}`)}</span>
              {dropped > 0 && <><span aria-hidden>·</span><span>{b.dropped(dropped)}</span></>}
              {result.refreshable && (<><span aria-hidden>·</span>
                <button type="button" onClick={() => run(true)} className="min-h-11 font-medium text-accent">{b.refresh}</button></>)}
            </p>
          )}
        </div>
      )}
      {stopped && !stream.running && <p className="mt-2 text-[13px] text-ink-3">{b.stopped}</p>}
      {errorText && !stream.running && (
        <p role="alert" className="mt-2 flex flex-wrap items-center gap-x-2 text-[13px] text-contradicts">
          <span>{errorText}</span>
          {error?.code !== "cap" && error?.code !== "not_configured" &&
            <button type="button" onClick={() => run()} className="min-h-11 font-medium text-accent">{b.retry}</button>}
        </p>
      )}
      <p className="mt-2 text-[12px] leading-4 text-ink-3">{b.note}</p>
    </div>
  );
}
