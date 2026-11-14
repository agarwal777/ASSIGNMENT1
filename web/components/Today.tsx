"use client";

import { useMemo, useState } from "react";
import {
  READ_MIN, WINDOWS, bps, crore, fmtDay, fmtTime, inWindow, label, minutesSkipped, pct, split,
  type Digest, type DigestEvent,
} from "@/lib/digest";

const DAY = 24 * 3600_000;

export default function Today({ digest }: { digest: Digest }) {
  const [asOf, setAsOf] = useState(() => new Date(digest.default_as_of));
  const [hours, setHours] = useState<number>(24);
  const [showMath, setShowMath] = useState(false);

  const first = useMemo(
    () => Math.min(...digest.events.map((e) => new Date(e.at).getTime())), [digest]);
  const last = useMemo(
    () => Math.max(...digest.events.map((e) => new Date(e.at).getTime())), [digest]);

  const windowed = useMemo(() => inWindow(digest.events, asOf, hours), [digest, asOf, hours]);
  const { needs, worth, folded } = useMemo(() => split(windowed), [windowed]);
  const filings = windowed.filter((e) => e.kind === "filing").length;
  const saved = minutesSkipped(folded.length, worth.length);

  const shift = (days: number) => setAsOf((d) => new Date(d.getTime() + days * DAY));

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-24 pt-6">
      <header className="border-b border-ink/15 pb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-3xl tracking-tight">FINN</h1>
          <span className="text-xs uppercase tracking-widest text-ink/50">Morning brief</span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button aria-label="Previous day" onClick={() => shift(-1)}
            disabled={asOf.getTime() - DAY < first}
            className="rounded px-2 py-1 text-lg text-ink/60 disabled:opacity-20">‹</button>
          <div className="text-center">
            <div className="font-serif text-lg">{fmtDay(asOf)}</div>
            <div className="text-xs text-ink/50">as of 08:00 IST · replaying filed data</div>
          </div>
          <button aria-label="Next day" onClick={() => shift(1)}
            disabled={asOf.getTime() + DAY > last + DAY}
            className="rounded px-2 py-1 text-lg text-ink/60 disabled:opacity-20">›</button>
        </div>

        <div className="mt-3 flex justify-center gap-1" role="tablist" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button key={w.label} role="tab" aria-selected={hours === w.hours}
              onClick={() => setHours(w.hours)}
              className={`rounded-full px-3 py-1 text-sm ${hours === w.hours
                ? "bg-ink text-paper" : "text-ink/60 hover:text-ink"}`}>
              {w.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm text-ink/70">
          <strong className="text-ink">{filings}</strong> filings across your portfolio ·{" "}
          <strong className="text-accent">{needs.length}</strong> need you ·{" "}
          {folded.length} folded ·{" "}
          <button onClick={() => setShowMath((s) => !s)} className="underline decoration-dotted">
            ≈{saved} min of reading skipped (est.)
          </button>
        </p>
        {showMath && (
          <p className="mt-2 rounded bg-ink/5 p-2 text-xs text-ink/70">
            Estimate, not a measurement: {folded.length} folded × {READ_MIN.folded} min +{" "}
            {worth.length} one-liners × {READ_MIN.worth} min. Both reading times are assumptions.
          </p>
        )}
      </header>

      <Section title="Needs you" empty="Nothing in this window needs your attention.">
        {needs.map((e) => <Card key={e.id} e={e} />)}
      </Section>

      {worth.length > 0 && (
        <Section title="Worth a read">
          <ul className="divide-y divide-ink/10">
            {worth.map((e) => <Line key={e.id} e={e} />)}
          </ul>
        </Section>
      )}

      {folded.length > 0 && <Folded events={folded} />}

      <p className="mt-10 text-center font-serif text-ink/50">
        That&apos;s everything that matters in this window.
      </p>
      <p className="mt-6 text-center text-[11px] text-ink/40">{digest.scoring_note}</p>
    </main>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode }) {
  const isEmpty = Array.isArray(children) && children.length === 0;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink/50">{title}</h2>
      {isEmpty && empty ? <p className="text-sm text-ink/50">{empty}</p> : children}
    </section>
  );
}

function Meta({ e }: { e: DigestEvent }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink/50">
      <span className="font-semibold text-ink">{e.symbol}</span>
      <span>{label(e.category)}</span>
      <span aria-hidden>·</span>
      <span>{fmtTime(e.at)}</span>
    </div>
  );
}

function Card({ e }: { e: DigestEvent }) {
  return (
    <article className="mb-4 rounded-lg border border-ink/15 p-4 shadow-sm">
      <Meta e={e} />
      <h3 className="mt-1 font-serif text-xl leading-snug">{headline(e)}</h3>
      {e.results?.metrics && Object.keys(e.results.metrics).length > 0 && <ResultsTable e={e} />}
      {e.kind === "filing" && !e.results && e.summary && (
        <p className="mt-2 text-sm text-ink/80">{e.summary}</p>
      )}
      <Reasons reasons={e.reasons} />
      <Source e={e} />
    </article>
  );
}

function headline(e: DigestEvent): string {
  if (e.results?.period) return `${e.name}: ${e.results.period.replace("FY", " FY")} results`;
  if (e.kind === "move") return `${e.name}: ${e.summary}`;
  return e.summary || `${e.name}: ${e.title}`;
}

function ResultsTable({ e }: { e: DigestEvent }) {
  const r = e.results!;
  const rows: [string, keyof typeof r.metrics][] = [
    ["Revenue", "revenue"], ["EBITDA", "ebitda"], ["PBT", "pbt"], ["PAT", "pat"]];
  return (
    <div className="mt-3">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-ink/50">
            <th className="font-normal">{r.basis}</th>
            <th className="text-right font-normal">This qtr</th>
            <th className="text-right font-normal">QoQ</th>
            <th className="text-right font-normal">YoY</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, k]) => {
            const m = r.metrics[k];
            return (
              <tr key={k} className="border-t border-ink/10">
                <td className="py-1" title={k === "ebitda" ? EBITDA_DEF : undefined}>
                  {name}{k === "ebitda" && <sup className="text-ink/40">*</sup>}
                </td>
                <td className="text-right">{crore(m?.value_cr)}</td>
                <td className={`text-right ${tone(m?.qoq_pct)}`}>{pct(m?.qoq_pct)}</td>
                <td className={`text-right ${tone(m?.yoy_pct)}`}>{pct(m?.yoy_pct)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-ink/10">
            <td className="py-1">EBITDA margin</td>
            <td className="text-right">{r.ebitda_margin.pct ?? "—"}%</td>
            <td className={`text-right ${tone(r.ebitda_margin.qoq_bps)}`}>{bps(r.ebitda_margin.qoq_bps)}</td>
            <td className={`text-right ${tone(r.ebitda_margin.yoy_bps)}`}>{bps(r.ebitda_margin.yoy_bps)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-ink/40">
        Calculated by FINN from the XBRL filing. *{EBITDA_DEF}
      </p>
      {r.warnings.map((w) => (
        <p key={w} className="mt-1 text-xs text-amber-700 dark:text-amber-400">Note: {w}</p>
      ))}
    </div>
  );
}

const EBITDA_DEF =
  "EBITDA = profit before exceptional items and tax + finance costs + depreciation − other income (− associates when inside PBT).";

const tone = (v: number | null | undefined) =>
  v == null ? "text-ink/40" : v < 0 ? "text-accent" : "text-ink";

function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <li key={r} className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink/70">{r}</li>
      ))}
    </ul>
  );
}

function Source({ e }: { e: DigestEvent }) {
  if (!e.url) return <p className="mt-3 text-xs text-ink/40">Source: end-of-day prices (Yahoo Finance)</p>;
  return (
    <p className="mt-3 text-xs text-ink/50">
      <a href={e.url} target="_blank" rel="noreferrer" className="underline">Exchange filing ↗</a>
      {e.related.length > 0 && <span> · +{e.related.length} related on the same day</span>}
    </p>
  );
}

function Line({ e }: { e: DigestEvent }) {
  return (
    <li className="py-3">
      <Meta e={e} />
      <p className="mt-0.5 text-sm">
        {e.results?.period
          ? `${e.results.period} results: revenue ${pct(e.results.metrics.revenue?.yoy_pct)} YoY, EBITDA margin ${bps(e.results.ebitda_margin.yoy_bps)}`
          : e.summary || e.title}
        {e.url && (
          <a href={e.url} target="_blank" rel="noreferrer" className="ml-1 text-xs text-ink/50 underline">filing ↗</a>
        )}
      </p>
    </li>
  );
}

function Folded({ events }: { events: DigestEvent[] }) {
  const groups = events.reduce<Record<string, DigestEvent[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink/50">
        Folded · {events.length} routine
      </h2>
      {Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([cat, es]) => (
        <details key={cat} className="border-t border-ink/10 py-2">
          <summary className="cursor-pointer text-sm text-ink/70">
            {label(cat)} <span className="text-ink/40">· {es.length}</span>
          </summary>
          <ul className="mt-1 space-y-1 pl-3">
            {es.map((e) => (
              <li key={e.id} className="text-xs text-ink/60">
                <span className="font-semibold">{e.symbol}</span> {e.summary || e.title}
                {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="ml-1 underline">↗</a>}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
