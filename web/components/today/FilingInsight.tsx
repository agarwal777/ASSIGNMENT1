"use client";

import { useState } from "react";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { copy } from "@/lib/copy";
import { date, pct } from "@/lib/format";
import type { Explanation } from "@/lib/filingExplain";
import type { Move, Reaction } from "@/lib/reaction";

type Reactions = { now: Reaction; past: Reaction[]; pastKind: "results" | "same_type" } | null;
type Err = { code: string; message: string };
const s = copy.insight;

async function call<T>(id: string, mode: string): Promise<T> {
  const r = await fetch("/api/filing-insight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, mode }) });
  return r.json();
}

/**
 * "What this filing means", collapsed under a filing. Opening it loads the price reaction (a calculation,
 * instant) and any cached explanation; a new explanation is generated only when the investor asks.
 */
export default function FilingInsight({ id, refDate }: { id: string; refDate?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [reaction, setReaction] = useState<Reactions | undefined>();
  const [ex, setEx] = useState<Explanation | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);

  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || loaded) return;
    setLoaded(true);
    call<{ reaction: Reactions }>(id, "reaction").then((r) => setReaction(r.reaction ?? null)).catch(() => setReaction(null));
    call<{ explanation?: Explanation; url?: string }>(id, "peek").then((r) => { if (r.explanation) { setEx(r.explanation); setUrl(r.url ?? null); } }).catch(() => {});
  };
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await call<{ explanation?: Explanation; url?: string; error?: Err }>(id, "explain");
      if (r.error) setErr(r.error); else if (r.explanation) { setEx(r.explanation); setUrl(r.url ?? null); }
    } catch (e) { setErr({ code: "network", message: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };
  const pageHref = (p: number) => (url ? `${url}#page=${p}` : undefined);

  return (
    <details onToggle={onToggle} className="mt-3 rounded-[8px] border border-line">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13px] font-medium text-ink-2">{s.open}</summary>
      <div className="space-y-4 px-3 pb-3">
        {/* Price: what happened after this filing, and after earlier ones. */}
        <section>
          <h4 className="flex items-center gap-1.5 text-[13px] font-medium">{s.priceTitle} <EpistemicTag e="CALCULATED" /></h4>
          {reaction === undefined ? <p className="mt-1 text-[13px] text-ink-3">…</p>
            : reaction === null ? <p className="mt-1 text-[13px] text-ink-2">{s.noPrices}</p>
            : <PriceBlock r={reaction} refDate={refDate} />}
        </section>

        {/* Summary and what it means, from the PDF. */}
        <section>
          <h4 className="flex items-center gap-1.5 text-[13px] font-medium">{s.summaryTitle} {ex && <EpistemicTag e="EXTRACTED" />}</h4>
          {ex ? <ExplanationView ex={ex} pageHref={pageHref} />
            : busy ? <p className="mt-1 text-[13px] text-ink-2" role="status">{s.reading}</p>
            : (
              <div className="mt-1">
                <button type="button" onClick={run}
                  className="min-h-11 w-full rounded-[8px] border border-accent text-[15px] font-medium text-accent">{err ? s.retry : s.explain}</button>
                <p className="mt-1 text-[12px] text-ink-3">{s.explainNote}</p>
                {err && <p className="mt-1 text-[13px] text-ink-2" role="alert">{err.message}</p>}
              </div>
            )}
        </section>
      </div>
    </details>
  );
}

const fmtMove = (m: Move | null) => (m ? pct(m.pct) : "–");
const rupees = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function PriceBlock({ r, refDate }: { r: NonNullable<Reactions>; refDate?: string }) {
  const n = r.now;
  return (
    <div className="mt-1 text-[13px]">
      {!n.base ? <p className="text-ink-2">{s.noPrices}</p>
        : !n.day1 ? <p className="text-ink-2">{s.noCloseYet(rupees(n.base.close), date(n.base.day, refDate))}</p>
        : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <dt className="text-ink-2">{s.nextClose} · {date(n.day1.day, refDate)}</dt><dd className="font-medium tabular-nums">{fmtMove(n.day1)}</dd>
            {n.day5 && <><dt className="text-ink-2">{s.fiveDays}</dt><dd className="font-medium tabular-nums">{fmtMove(n.day5)}</dd></>}
            {n.latest && n.latest.tradingDays > 1 && <><dt className="text-ink-2">{s.sinceFiling(n.latest.tradingDays)}</dt>
              <dd className="font-medium tabular-nums">{fmtMove(n.latest)}</dd></>}
          </dl>
        )}
      <p className="mt-3 text-ink-2">{r.past.length ? s.pastTitle(r.pastKind, r.past.length) : s.pastNone(r.pastKind)}</p>
      {r.past.length > 0 && (
        <table className="mt-1 w-full text-left tabular-nums">
          <thead><tr className="text-[12px] text-ink-3">{s.pastCols.map((c, i) => <th key={c} className={`font-normal ${i ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
          <tbody>{r.past.map((p) => (
            <tr key={p.at}><td>{date(p.at, refDate)}</td><td className="text-right">{fmtMove(p.day1)}</td><td className="text-right">{fmtMove(p.day5)}</td></tr>
          ))}</tbody>
        </table>
      )}
      <p className="mt-2 text-[12px] text-ink-3">{s.priceNote}{r.pastKind === "results" && r.past.length > 0 && ` ${s.xbrlNote}`}</p>
    </div>
  );
}

function ExplanationView({ ex, pageHref }: { ex: Explanation; pageHref: (p: number) => string | undefined }) {
  if (!ex.points.length) return <p className="mt-1 text-[13px] text-ink-2">{s.nothingKept}</p>;
  const list = (xs: Explanation["points"]) => (
    <ul className="mt-1 space-y-2">
      {xs.map((p, i) => (
        <li key={i} className="text-[15px] leading-[22px]">
          {p.text}{" "}
          <details className="inline">
            <summary className="inline cursor-pointer text-[12px] text-accent underline underline-offset-2">{s.page(p.page)}</summary>
            <blockquote className="mt-1 border-l-2 border-line pl-2 text-[13px] italic text-ink-2">
              “{p.quote}” {pageHref(p.page) && <a href={pageHref(p.page)} target="_blank" rel="noreferrer" className="not-italic text-accent underline">PDF</a>}
            </blockquote>
          </details>
        </li>
      ))}
    </ul>
  );
  return (
    <div>
      {list(ex.points)}
      {ex.impact.length > 0 && <><h4 className="mt-3 text-[13px] font-medium">{s.impactTitle}</h4>{list(ex.impact)}</>}
      <p className="mt-2 text-[12px] text-ink-3">
        {s.pagesRead(ex.pagesRead, ex.pageCount)}{ex.dropped > 0 && ` ${s.dropped(ex.dropped)}`}
      </p>
    </div>
  );
}
