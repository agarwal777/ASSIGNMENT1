"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import PersonChip from "@/components/people/PersonChip";
import BulletChart from "@/components/trust/BulletChart";
import { copy } from "@/lib/copy";
import { date, pct, ratio } from "@/lib/format";
import { isProblem, STATUS, STATUS_ORDER, statusCounts, type Status } from "@/lib/status";
import type { PersonRef, PortfolioRow } from "@/lib/types";
import { loadNetwork } from "@/lib/vault";

type Filter = "all" | "needs" | "behind" | "moves";
const MATCH: Record<Filter, (r: PortfolioRow) => boolean> = {
  all: () => true,
  needs: (r) => r.needsYou,
  behind: (r) => r.thesis.some((t) => isProblem(t.status)),
  moves: (r) => Boolean(r.move),
};

const countsText = (items: { status: Status }[]) =>
  statusCounts(items).map(({ status, n }) => copy.portfolio.tag(n, STATUS[status].label)).join(" · ");

/** Portfolio: one stacked bar of every tracked claim, filter chips that double as the summary, rows that expand in place. */
export default function PortfolioView({ rows, refDate }: { rows: PortfolioRow[]; refDate: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const all = rows.flatMap((r) => r.thesis);
  const shown = rows.filter(MATCH[filter]);

  return (
    <div className="px-4 pb-6">
      <ClaimsBar items={all} />

      <div role="group" aria-label={copy.portfolio.filterLabel} className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(MATCH) as Filter[]).map((f) => {
          const n = rows.filter(MATCH[f]).length;
          const on = filter === f;
          return (
            <button key={f} type="button" aria-pressed={on} onClick={() => { setFilter(f); setOpen(null); }}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-medium ${
                on ? "border-accent bg-accent text-surface" : "border-line bg-surface text-ink-2"}`}>
              {copy.portfolio.filters[f]}{f !== "all" && <span className={on ? "" : "text-ink-3"}> {n}</span>}
            </button>
          );
        })}
      </div>

      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface">
        {shown.map((r) => (
          <Row key={r.symbol} r={r} refDate={refDate} open={open === r.symbol}
            onToggle={() => setOpen(open === r.symbol ? null : r.symbol)} />
        ))}
        {shown.length === 0 && <li className="p-4 text-[15px] text-ink-2">{copy.portfolio.noneMatch}</li>}
      </ul>
      <p className="pt-4 text-[13px] text-ink-3">{copy.portfolio.syntheticNote}</p>
    </div>
  );
}

function ClaimsBar({ items }: { items: { status: Status }[] }) {
  const counts = statusCounts(items);
  const text = countsText(items);
  return (
    <figure className="m-0 pt-3">
      {items.length > 0 && (
        <div role="img" aria-label={copy.portfolio.claimsBar(text)} className="flex h-2 gap-[2px]">
          {counts.map(({ status, n }) => (
            <div key={status} className={`rounded-[2px] ${STATUS[status].bar}`} style={{ flexGrow: n }} />
          ))}
        </div>
      )}
      <figcaption className="mt-1.5 text-[13px] text-ink-2">{copy.portfolio.claimsLine(items.length, text)}</figcaption>
    </figure>
  );
}

function Tags({ r }: { r: PortfolioRow }) {
  const counts = statusCounts(r.thesis);
  const m = r.move;
  if (counts.length === 0 && !m) return null;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      {counts.map(({ status, n }) => {
        const s = STATUS[status];
        return (
          <span key={status} className={`inline-flex items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-5 ${s.text} ${s.bg}`}>
            <s.Icon size={11} strokeWidth={2.5} aria-hidden /> {copy.portfolio.tag(n, s.label)}
          </span>
        );
      })}
      {m && (
        <span className="rounded-full border border-line px-2 text-[11px] font-medium leading-5 text-ink-2">
          {copy.portfolio.moveTag(m.returnPct != null ? pct(m.returnPct) : "", m.volumeMultiple != null ? ratio(m.volumeMultiple) : "")}
        </span>
      )}
    </span>
  );
}

function Row({ r, refDate, open, onToggle }: { r: PortfolioRow; refDate: string; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const href = `/company/${encodeURIComponent(r.symbol)}`;
  const claims = [...r.claims].sort((a, b) => STATUS_ORDER.indexOf(a.claim.status) - STATUS_ORDER.indexOf(b.claim.status));
  return (
    <li>
      <button type="button" aria-expanded={open} aria-label={open ? copy.portfolio.openCompany(r.shortName) : copy.portfolio.expand(r.shortName)}
        onClick={() => (open ? router.push(href) : onToggle())}
        className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {r.needsYou && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={copy.portfolio.filters.needs} />}
            <span className="truncate text-[15px] font-medium">{r.shortName}</span>
          </span>
          <span className="block truncate text-[13px] text-ink-3">{r.symbol} · {r.sector}</span>
          {r.headline && (
            <span className="mt-1 block font-serif text-[16px] leading-[22px]">
              {r.headline.text} <span className="font-sans text-[12px] text-ink-3">· {date(r.headline.at, refDate)}</span>
            </span>
          )}
        </span>
        <Tags r={r} />
        {open ? <ChevronRight size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          : <ChevronDown size={18} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />}
      </button>
      {open && <Expanded r={r} claims={claims} href={href} refDate={refDate} />}
    </li>
  );
}

function Expanded({ r, claims, href, refDate }: { r: PortfolioRow; claims: PortfolioRow["claims"]; href: string; refDate: string }) {
  return (
    <div className="space-y-4 px-4 pb-4">
      {claims.length > 0 ? (
        <ul className="space-y-3">
          {claims.map((c) => (
            <li key={c.label + c.claim.deadline}>
              <p className="mb-1 text-[13px] font-medium">{c.label} <span className="font-normal text-ink-3">· {c.claim.deadline}</span></p>
              <BulletChart claim={c.claim} label={c.label} />
            </li>
          ))}
        </ul>
      ) : (
        <Link href={`${href}#ledger`}
          className="flex min-h-11 items-center justify-center rounded-[8px] border border-accent px-3 text-[15px] font-medium text-accent">
          {copy.portfolio.trackClaims}
        </Link>
      )}
      <Person r={r} refDate={refDate} />
      {r.nextEvent && (
        <p className="text-[13px] text-ink-2">
          <span className="font-medium text-ink">{copy.portfolio.nextEvent}:</span> {r.nextEvent.text} {date(r.nextEvent.at, refDate)}
          {r.nextEvent.note && <span className="text-ink-3"> · {r.nextEvent.note}</span>}
        </p>
      )}
      <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-accent">
        {copy.portfolio.openCompany(r.shortName)} <ChevronRight size={16} aria-hidden />
      </Link>
    </div>
  );
}

/** One person, matched on the device; the network and matcher load only when a row opens. */
function Person({ r, refDate }: { r: PortfolioRow; refDate: string }) {
  const [state, setState] = useState<{ person?: PersonRef | null; failed?: boolean }>({});
  useEffect(() => {
    let live = true;
    Promise.all([loadNetwork(), import("@/lib/people")])
      .then(([contacts, { suggestionsFor, toPersonRef }]) => {
        const [s] = suggestionsFor(r.symbol, r.eventId ?? "", contacts, refDate);
        if (live) setState({ person: s ? toPersonRef(s) : null });
      })
      .catch(() => live && setState({ failed: true }));
    return () => { live = false; };
  }, [r.symbol, r.eventId, refDate]);
  if (state.failed) return <p className="text-[13px] text-ink-3">{copy.portfolio.networkFailed}</p>;
  if (state.person === undefined) return <p className="text-[13px] text-ink-3">{copy.portfolio.findingPerson}</p>;
  if (state.person === null || !r.eventId) return <p className="text-[13px] text-ink-2">{copy.portfolio.noPerson(r.shortName)}</p>;
  return <PersonChip person={state.person} eventId={r.eventId} />;
}
