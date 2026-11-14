"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import executivesData from "@/data/executives.json";
import orgsData from "@/data/orgs.json";
import TopBar from "@/components/shell/TopBar";
import EventCard from "@/components/today/EventCard";
import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { DEFAULT_AS_OF, EVENT_RANGE, SCORING_NOTE, getDigest } from "@/lib/api";
import { copy } from "@/lib/copy";
import { date, time } from "@/lib/format";
import { whoToAsk, type Contact, type Executive, type Orgs } from "@/lib/network";
import type { Card } from "@/lib/types";
import { loadNetwork } from "@/lib/vault";

const DAY = 24 * 3600_000;
const WINDOWS = [{ key: "24h", hours: 24 }, { key: "7d", hours: 168 }] as const;
const orgs = orgsData as unknown as Orgs;
const executives: Executive[] = executivesData.executives.map((x) => ({
  ...x, stints: x.stints.map((s) => ({ ...s, datesKnown: s.start != null })),
}));

/** "2026-11-06" → "2026-11-06T08:00:00+05:30": the brief is read at 08:00 IST. */
const asOfFor = (day: string) => `${day}T08:00:00+05:30`;
const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const fracYear = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCFullYear() + (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / (365.25 * DAY);
};

export default function TodayView() {
  const q = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const day = q.get("date") ?? dayOf(DEFAULT_AS_OF);
  const win = WINDOWS.find((w) => w.key === q.get("window")) ?? WINDOWS[0];
  const asOf = asOfFor(day);

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [showAllWorth, setShowAllWorth] = useState(false);
  useEffect(() => { loadNetwork().then(setContacts).catch(() => setNetworkError(true)); }, []);

  const digest = useMemo(() => getDigest(asOf, win.hours), [asOf, win.hours]);
  const cards = useMemo(() => digest.needsYou.map((c) => withPerson(c, contacts, asOf)), [digest, contacts, asOf]);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(q.toString());
    if (v === null) p.delete(k); else p.set(k, v);
    router.replace(p.toString() ? `${pathname}?${p}` : pathname, { scroll: false });
  };
  const firstDay = dayOf(EVENT_RANGE.first), lastDay = dayOf(new Date(new Date(EVENT_RANGE.last).getTime() + DAY).toISOString());
  const shift = (n: number) => setParam("date", dayOf(new Date(new Date(asOf).getTime() + n * DAY).toISOString()));
  const worth = showAllWorth ? digest.worthARead : digest.worthARead.slice(0, 10);

  return (
    <>
      <TopBar title={copy.today.title} />

      {/* Replay banner: always shown, because every view of this prototype replays filed data. */}
      <div className="sticky top-14 z-20 flex items-center justify-between border-b border-line bg-accent/10 px-2 backdrop-blur">
        <button onClick={() => shift(-1)} disabled={day <= firstDay} aria-label={copy.today.prevDay}
          className="flex h-11 w-11 items-center justify-center text-accent disabled:opacity-30"><ChevronLeft size={20} aria-hidden /></button>
        <p className="text-center text-[13px] font-medium text-accent">
          {copy.today.viewing(date(asOf, asOf))} <span className="font-normal text-ink-2">· {copy.today.replay}</span>
        </p>
        <button onClick={() => shift(1)} disabled={day >= lastDay} aria-label={copy.today.nextDay}
          className="flex h-11 w-11 items-center justify-center text-accent disabled:opacity-30"><ChevronRight size={20} aria-hidden /></button>
      </div>

      <div className="px-4 pb-6">
        {/* Digest header */}
        <p className="mt-4 text-[15px]">
          {copy.today.header(digest.totals.filings, digest.totals.touched)}
          {digest.readingEstimate && (
            <span className="block text-[13px] text-ink-2">
              ≈ <Num v={{ value: digest.readingEstimate.minutes, kind: "count", epistemic: "CALCULATED", formula: digest.readingEstimate.formula }} />{" "}
              {copy.today.minutesSkipped}
            </span>
          )}
        </p>

        {/* Window chips */}
        <div role="tablist" aria-label={copy.today.windowLabel} className="mt-2 flex gap-2">
          {WINDOWS.map((w) => (
            <button key={w.key} role="tab" aria-selected={w.key === win.key}
              onClick={() => setParam("window", w.key === "24h" ? null : w.key)}
              className={`min-h-11 rounded-full px-4 text-[13px] font-medium ${w.key === win.key
                ? "bg-ink text-bg" : "border border-line text-ink-2"}`}>
              {copy.today.windows[w.key]}
            </button>
          ))}
        </div>

        {/* Needs you */}
        <section aria-labelledby="needs" className="mt-6">
          <h2 id="needs" className="mb-3 text-[13px] font-medium text-ink-2">
            {copy.today.needsYou} <span className="text-accent">· {cards.length}</span>
          </h2>
          {cards.length === 0
            ? <p className="text-[15px] text-ink-2">{copy.today.nothingNeedsYou}</p>
            : <div className="space-y-3">{cards.map((c) => <EventCard key={c.id} card={c} refDate={asOf} />)}</div>}
          {networkError && <p className="mt-2 text-[13px] text-ink-3">{copy.today.networkUnavailable}</p>}
        </section>

        {/* Worth a read */}
        {digest.worthARead.length > 0 && (
          <section aria-labelledby="worth" className="mt-8">
            <h2 id="worth" className="mb-1 text-[13px] font-medium text-ink-2">{copy.today.worthARead} · {digest.worthARead.length}</h2>
            <ul className="divide-y divide-line">
              {worth.map((w) => (
                <li key={w.id} className="py-2">
                  <p className="text-[13px] text-ink-3"><span className="font-medium text-ink">{w.companyName}</span> · {time(w.at)}, {date(w.at, asOf)}</p>
                  <p className="text-[15px] leading-[22px]">{w.summary}</p>
                  {w.source.documentId && <SourceLink s={w.source} refDate={asOf} />}
                </li>
              ))}
            </ul>
            {digest.worthARead.length > 10 && !showAllWorth && (
              <button onClick={() => setShowAllWorth(true)} className="min-h-11 text-[13px] font-medium text-accent">
                {copy.today.showAll(digest.worthARead.length)}
              </button>
            )}
          </section>
        )}

        {/* Collapsed */}
        {digest.collapsed.length > 0 && (
          <section aria-labelledby="folded" className="mt-8">
            <details className="rounded-[12px] border border-line bg-surface">
              <summary id="folded" className="flex min-h-11 cursor-pointer items-center px-4 text-[15px]">
                {copy.today.folded(digest.collapsed.reduce((n, g) => n + g.count, 0))}
              </summary>
              <div className="divide-y divide-line border-t border-line">
                {digest.collapsed.map((g) => (
                  <details key={g.category} className="px-4">
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between text-[13px] font-medium">
                      {copy.category[g.category] ?? g.category}<span className="text-ink-3">{g.count}</span>
                    </summary>
                    <ul className="pb-2">
                      {g.items.map((it) => <li key={it.id}><SourceLink s={{ ...it.source, label: it.title }} refDate={asOf} /></li>)}
                    </ul>
                  </details>
                ))}
              </div>
            </details>
          </section>
        )}

        {/* Done */}
        <p className="mt-10 text-center font-serif text-[19px] text-ink-2">{copy.today.done}</p>
        <p className="mt-2 text-center text-[11px] text-ink-3">{SCORING_NOTE}</p>
      </div>
    </>
  );
}

/** Attach the strongest person from the investor's own network (computed on the device). */
function withPerson(c: Card, contacts: Contact[] | null, asOf: string): Card {
  if (!contacts) return c;
  const [s] = whoToAsk(c.companySymbol, c.id, contacts, executives, orgs, fracYear(asOf));
  if (!s) return c;
  const person = { contactId: s.contact.id, displayName: s.contact.name, reason: s.reason, strength: s.score, confirmed: !s.probable };
  if (c.variant === "management_change" && s.via) {
    return { ...c, person, path: { steps: [copy.people.you, s.contact.name, s.via], strength: s.score, confirmed: !s.probable, explanation: s.reason } };
  }
  return { ...c, person };
}
