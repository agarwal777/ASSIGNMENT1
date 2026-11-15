"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import TopBar from "@/components/shell/TopBar";
import DayStrip from "@/components/today/DayStrip";
import EventCard from "@/components/today/EventCard";
import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { BRIEF_DAYS, DATA_TO_DAY, LATEST_DAY, QUARTERS_COMPACT, RESULTS_WEEK_DAY, SCORING_NOTE, asOfFor, getDigest } from "@/lib/api";
import { assumptionText, checkAssumption, loadAssumptions, onAssumptions, rowsFromCompact, type Saved } from "@/lib/assumption";
import type { Card } from "@/lib/types";
import { copy } from "@/lib/copy";
import { date, time } from "@/lib/format";
import type { Contact } from "@/lib/network";
import { withPerson } from "@/lib/people";
import { loadNetwork } from "@/lib/vault";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/moves";
import { loadThresholds, onThresholds } from "@/lib/settings";

const WINDOWS = [{ key: "24h", hours: 24 }, { key: "7d", hours: 168 }] as const;

/**
 * Reviewed card ids, per replay date, in localStorage. Storage can be missing or blocked (private
 * mode): every access is wrapped, and an in-memory copy keeps the button working for this visit.
 */
const reviewKey = (day: string) => `finn.reviewed.${day}`;
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
function readRaw(day: string): string {
  const k = reviewKey(day);
  try { return window.localStorage.getItem(k) ?? memory.get(k) ?? "[]"; } catch { return memory.get(k) ?? "[]"; }
}
function writeRaw(day: string, v: string) {
  memory.set(reviewKey(day), v);
  try { window.localStorage.setItem(reviewKey(day), v); } catch { /* kept in memory only */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => { listeners.delete(l); window.removeEventListener("storage", l); };
}
function parseIds(raw: string): string[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

export default function TodayView() {
  const q = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = q.get("date");
  const day = asked && BRIEF_DAYS.includes(asked) ? asked : LATEST_DAY;
  const latest = day === LATEST_DAY;
  const win = WINDOWS.find((w) => w.key === q.get("window")) ?? WINDOWS[0];
  const asOf = asOfFor(day);

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [showAllWorth, setShowAllWorth] = useState(false);
  useEffect(() => { loadNetwork().then(setContacts).catch(() => setNetworkError(true)); }, []);
  // The investor's alert thresholds re-score price/volume moves (Settings); defaults until loaded.
  const [thr, setThr] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  useEffect(() => { loadThresholds().then(setThr); return onThresholds(setThr); }, []);
  // The investor's saved assumption edits: a card's status and chart follow them; ranking stays as built.
  const [saved, setSaved] = useState<Saved>({});
  useEffect(() => { loadAssumptions().then(setSaved); return onAssumptions(setSaved); }, []);
  // The server renders "nothing reviewed"; the device's stored list takes over after hydration.
  const reviewedRaw = useSyncExternalStore(subscribe, () => readRaw(day), () => "[]");
  const reviewedIds = useMemo(() => parseIds(reviewedRaw), [reviewedRaw]);
  const toggleReviewed = (id: string) => {
    const ids = reviewedIds.includes(id) ? reviewedIds.filter((x) => x !== id) : [...reviewedIds, id];
    writeRaw(day, JSON.stringify(ids));
  };

  const digest = useMemo(() => getDigest(asOf, win.hours, thr), [asOf, win.hours, thr]);
  // README §6.2 network bonus N, computed here because the network never leaves the device:
  // N = 1 when a contact's link strength is ≥ 0.5. It adds 0.10 and only reorders "Needs you".
  const cards = useMemo(() => digest.needsYou
    .map((c) => withEdit(c, saved))
    .map((c) => withPerson(c, contacts, asOf, copy.people.you))
    .map((c) => {
      const n = c.person && c.person.strength >= 0.5 ? 1 : 0;
      return { c: n ? { ...c, reasons: [...c.reasons, copy.today.networkReason] } : c, final: 0.9 * c.score + 0.1 * n };
    })
    .sort((a, b) => b.final - a.final)
    .map((x) => x.c), [digest, contacts, asOf, saved]);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(q.toString());
    if (v === null) p.delete(k); else p.set(k, v);
    router.replace(p.toString() ? `${pathname}?${p}` : pathname, { scroll: false });
  };
  const counts = useMemo(() => Object.fromEntries(BRIEF_DAYS.map((d) => [d, getDigest(asOfFor(d), 24, thr).needsYou.length])), [thr]);
  const pick = (d: string) => setParam("date", d === LATEST_DAY ? null : d);
  const worth = showAllWorth ? digest.worthARead : digest.worthARead.slice(0, 10);

  return (
    <>
      <TopBar title={copy.today.title} right={
        <Link href="/settings" aria-label={copy.settings.open} className="-mr-2 flex h-11 w-11 items-center justify-center text-ink-2">
          <Settings size={20} aria-hidden />
        </Link>} />

      {/* Date: the latest brief by default; older dates are labelled as a replay. */}
      <div className="sticky top-14 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex min-h-11 items-center justify-between gap-2 px-4">
          <p className="text-[13px] font-medium text-accent">
            {latest
              ? <>{copy.today.latest} <span className="font-normal text-ink-2">· {copy.today.dataTo(date(asOfFor(DATA_TO_DAY), asOf))}</span></>
              : <>{copy.today.viewing(date(asOf, asOf))} <span className="font-normal text-ink-2">· {copy.today.replay}</span></>}
          </p>
          <button type="button" onClick={() => pick(RESULTS_WEEK_DAY)} aria-pressed={day === RESULTS_WEEK_DAY}
            className={`min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-medium ${
              day === RESULTS_WEEK_DAY ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-2"}`}>
            {copy.today.resultsWeek}
          </button>
        </div>
        <DayStrip days={BRIEF_DAYS} counts={counts} selected={day} onPick={pick} />
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
          <h2 id="needs" className="text-[13px] font-medium text-ink-2">
            {copy.today.needsYou} <span className="text-accent">· {cards.length}</span>
          </h2>
          {cards.length > 0 && <ReviewProgress done={cards.filter((c) => reviewedIds.includes(c.id)).length} total={cards.length} />}
          {cards.length === 0
            ? <p className="text-[15px] text-ink-2">{copy.today.nothingNeedsYou}</p>
            : <div className="space-y-3">{cards.map((c) => (
                <EventCard key={c.id} card={c} refDate={asOf} networkLoaded={contacts !== null}
                  reviewed={reviewedIds.includes(c.id)} onReviewed={() => toggleReviewed(c.id)} />
              ))}</div>}
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

function ReviewProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="mb-3 mt-2">
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={copy.card.progress(done, total)}
        className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(100 * done) / total}%` }} />
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{copy.card.progress(done, total)}</p>
    </div>
  );
}

/** Replace a card's investor assumption with the investor's saved edit, re-checked on the device. */
function withEdit(c: Card, saved: Saved): Card {
  const s = saved[c.companySymbol];
  if (!s || !c.assumption || c.assumption.ref.source !== "investor") return c;
  const chk = checkAssumption(s, rowsFromCompact(QUARTERS_COMPACT[c.companySymbol]), DATA_TO_DAY);
  return { ...c, assumption: { ...c.assumption, ref: { ...c.assumption.ref, text: assumptionText(s), deadline: s.deadline },
    status: chk.status, claim: chk.claim, rationale: chk.evidence, edited: true } };
}
