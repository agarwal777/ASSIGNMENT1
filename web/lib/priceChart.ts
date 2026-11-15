// Server only: one company's year of end-of-day closes, with the dated things FINN knows about
// marked on it. prices.json (≈120 KB, all companies) never reaches a client bundle; the Company
// page passes one series (≈250 points) to the chart.
import prices from "@/data/prices.json";
import { asOfFor, BRIEF_DAYS, eventsFor, filingHeadline } from "@/lib/api";
import { getCompany } from "@/lib/companies";
import { period as fmtPeriod } from "@/lib/format";
import type { SourceRef } from "@/lib/types";

export type PriceMarkKind = "results" | "call" | "alert";
/** `day` is the trading session the mark sits on; `on` is when it actually happened. */
export type PriceMark = { day: string; on: string; kind: PriceMarkKind; label: string; href?: string };
export type PriceSeries = { points: [string, number][]; marks: PriceMark[]; source: SourceRef };

const SERIES = prices as unknown as Record<string, [string, number][]>;

/** The filing time NSE puts in an XBRL file name: …_07052025102915_WEB.xml → 2025-05-07. */
export function xbrlFiledOn(url: string): string | null {
  const m = url.match(/_(\d{2})(\d{2})(\d{4})\d{6}_WEB\.xml$/i);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function priceSeries(symbol: string): PriceSeries | null {
  const points = SERIES[symbol];
  const c = getCompany(symbol);
  if (!points?.length || !c) return null;
  const first = points[0][0], last = points.at(-1)![0];
  // A mark on a non-trading day (a weekend, or results after the close) sits on the next session,
  // the first the market could react in. Marks outside the year are left off.
  const session = (on: string) => (on < first || on > last ? null : points.find(([d]) => d >= on)?.[0] ?? null);
  const marks: PriceMark[] = [];
  const add = (on: string | null, kind: PriceMarkKind, label: string, href?: string) => {
    const day = on && session(on);
    if (day && !marks.some((m) => m.kind === kind && m.day === day && m.label === label)) marks.push({ day, on: on!, kind, label, href });
  };

  for (const q of c.quarters) {
    const url = q.revenue?.source?.documentId ?? q.pat?.source?.documentId;
    add(url ? xbrlFiledOn(url) : null, "results", `${fmtPeriod(q.period)} results filed on NSE`);
  }
  for (const on of [...new Set(c.ledger.map((p) => p.saidAt.slice(0, 10)))]) add(on, "call", "Earnings call");
  // FINN's own alerts (the events a brief ranked above routine), linked to the brief that carried them.
  for (const e of eventsFor()) {
    if (e.symbol !== symbol || e.bucket === "collapsed") continue;
    const brief = BRIEF_DAYS.find((d) => asOfFor(d) >= e.at);
    add(e.at.slice(0, 10), "alert", filingHeadline(e.id) ?? e.title, brief ? `/today?date=${brief}` : undefined);
  }
  marks.sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind));

  return {
    points, marks,
    source: { documentId: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}.NS/history`,
      label: `${symbol}: end-of-day closes (Yahoo Finance)`, publishedAt: `${last}T15:30:00+05:30` },
  };
}
