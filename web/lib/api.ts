// Data access for the screens. Real data from the committed snapshot (web/data/*.json), mapped into
// the FRONTEND.md §7.2 contracts. Pure functions: no clock, no network. The investor's network is
// added on the device (lib/network.ts) because it never leaves their session.
import digestData from "@/data/digest.json";
import executivesData from "@/data/executives.json";
import movesData from "@/data/moves.json";
import { makeCalc } from "@/lib/calc";
import { toClaim } from "@/lib/claims";
import { DEFAULT_THRESHOLDS, moveEvents, type MovesData, type Thresholds } from "@/lib/moves";
import { copy } from "@/lib/copy";
import { bps as fmtBps, pct as fmtPct } from "@/lib/format";
import { distinctLabels } from "@/lib/sourceLabels";
import type { DigestEvent } from "@/lib/digest";
import type { Card, DigestResponse, MetricRow, NumValue, SourceRef, StatTile, Trend } from "@/lib/types";

export const SCORING_NOTE: string = digestData.scoring_note;
/** Compact quarters per company (from workers/build_digest.py), for re-checking an edited assumption. */
export const QUARTERS_COMPACT = (digestData as unknown as { quarters: Record<string, [string, number | null, number | null][]> }).quarters;
const EVENTS = digestData.events as unknown as DigestEvent[];
export const EVENT_RANGE = {
  first: EVENTS.reduce((m, e) => (e.at < m ? e.at : m), EVENTS[0].at),
  last: EVENTS.reduce((m, e) => (e.at > m ? e.at : m), EVENTS[0].at),
};

type Exec = (typeof executivesData.executives)[number] & { title?: string; effective?: string; profile_quote?: string };
const EXECS = executivesData.executives as Exec[];

export const READ_MIN = { folded: 0.5, worth: 1.5 };

/** "2026-11-06" → "2026-11-06T08:00:00+05:30": the brief is read at 08:00 IST. */
export const asOfFor = (day: string) => `${day}T08:00:00+05:30`;
/** ISO timestamp → its IST calendar day, "YYYY-MM-DD". */
export const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const getEvent = (id: string): DigestEvent | undefined => EVENTS.find((e) => e.id === id);

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** The day of the latest filing in the snapshot ("2026-11-14"): the data runs to here. */
export const DATA_TO_DAY = dayOf(EVENTS.filter((e) => e.kind === "filing").reduce((m, e) => (e.at > m ? e.at : m), ""));
/** The latest brief: 08:00 the morning after the latest filing. Today opens here. */
export const LATEST_DAY = addDays(DATA_TO_DAY, 1);
export const DEFAULT_AS_OF = asOfFor(LATEST_DAY);
/** The day a brief's data runs to: the brief for the 17th, 08:00 is shown as "16 Nov", so a brief built on the
 *  evening of the 16th never shows a date that hasn't happened yet. URLs and scoring keep the brief day. */
export const dataDayOf = (briefDay: string) => addDays(briefDay, -1);
export const FIRST_DAY = addDays(dayOf(EVENT_RANGE.first), 1);
/** The earliest day a custom window can start: the first day with an event in the snapshot. */
export const EARLIEST_DAY = dayOf(EVENT_RANGE.first);
/** The week most results landed in this snapshot. */
export const RESULTS_WEEK_DAY = "2026-11-06";
/** Every brief date the snapshot can show, oldest first. */
export const BRIEF_DAYS: string[] = (() => {
  const out: string[] = [];
  for (let d = FIRST_DAY; d <= LATEST_DAY; d = addDays(d, 1)) out.push(d);
  return out;
})();
/** Companies with a "needs you" card in each day's 24-hour brief: Portfolio uses the same answer as Today
 *  (the server uses the defaults; the browser re-runs this with the investor's saved settings). */
export function needsYouByDay(t?: Thresholds): Record<string, string[]> {
  return Object.fromEntries(BRIEF_DAYS.map((d) => [d, [...new Set(getDigest(asOfFor(d), 24, t).needsYou.map((c) => c.companySymbol))]]));
}

/**
 * Three questions for a call, from the event's public evidence only (templates, no model).
 * They ask for context and interpretation, never for unpublished price-sensitive information.
 */
export function callQuestions(e: DigestEvent, via?: string): string[] {
  const q: string[] = [];
  const r = e.results;
  if (r?.metrics?.revenue) {
    const m = r.ebitda_margin.yoy_bps;
    if (m != null && Math.abs(m) >= 100)
      q.push(`EBITDA margin moved ${fmtBps(m)} YoY. In this industry, is a move like that usually pricing, mix or input costs?`);
    const rev = r.metrics.revenue.yoy_pct;
    if (rev != null) q.push(`Revenue is ${fmtPct(rev)} YoY. How much of growth like this is volume and how much is price in this business?`);
    if (r.warnings.some((w) => w.includes("exceptional")))
      q.push("How does the industry usually treat an exceptional item like this one: one-off or recurring?");
  }
  if (e.category === "management_change" && via) {
    q.push(`What is ${via} like to work with, and what did they change in the roles you saw?`);
    q.push("What does a leader with that background usually prioritise in the first year?");
    q.push("How are leadership transitions like this usually received by teams and customers?");
  }
  if (e.category === "M&A") {
    q.push(`What does ${e.name} get from a deal like this that it couldn't build itself?`);
    q.push("How have similar deals in this sector worked out?");
  }
  if (e.kind === "move") {
    q.push("What public developments in this sector could explain a move like this?");
    q.push("How is demand in the sector looking from where you sit?");
  }
  q.push(`If you were me, what would you ask ${e.name}'s management on the next call?`);
  return [...new Set(q)].slice(0, 3);
}

/** A draft the investor edits and sends themselves. FINN never sends anything. */
export function callOpener(e: DigestEvent, contactName: string): string {
  const first = contactName.split(" ")[0];
  const hook = e.results?.period ? `just reported its ${e.results.period.replace("FY", " FY")} numbers`
    : e.category === "management_change" ? "announced a leadership change"
    : e.category === "M&A" ? "announced a deal"
    : e.kind === "move" ? "has been moving a lot"
    : "filed something I'm thinking about";
  return `Hi ${first}, hope you're well. ${e.name} ${hook}, and I'd value your read on the industry context. Do you have 15 minutes this week?`;
}

// ── helpers ──────────────────────────────────────────────────────────────────────────
const sourceOf = (e: DigestEvent): SourceRef | null =>
  e.url ? { documentId: e.url, label: `${e.symbol}: ${e.title}`, publishedAt: e.at } : null;

const growth = (value: number | null | undefined, what: string): NumValue | undefined =>
  value == null ? undefined
    : { value, kind: "pct", epistemic: "CALCULATED", formula: `${what}: (this period − comparison period) ÷ comparison period` };

const marginMove = (value: number | null | undefined, vs: string): NumValue | undefined =>
  value == null ? undefined
    : { value, kind: "bps", epistemic: "CALCULATED", formula: `EBITDA margin this quarter − EBITDA margin ${vs}, in basis points` };

const EBITDA_FORMULA =
  "EBITDA = profit before exceptional items and tax + finance costs + depreciation − other income (− share of associates when it sits inside PBT)";

/** Which metric drives the results headline (same rules as resultsHeadline). */
function driver(e: DigestEvent): "margin" | "pat" | "revenue" {
  const r = e.results!;
  const m = r.ebitda_margin.yoy_bps ?? null, rev = r.metrics.revenue?.yoy_pct ?? null, pat = r.metrics.pat?.yoy_pct ?? null;
  if (m != null && Math.abs(m) >= 150 && rev != null) return "margin";
  if (rev != null && pat != null && Math.abs(pat) >= 30) return "pat";
  return "revenue";
}

/** Two lead stats for the metrics in the headline, and the key metric's trend. */
function leadStats(e: DigestEvent, rows: MetricRow[]): { tiles: StatTile[]; trend?: Trend } {
  const by = (k: MetricRow["metric"]) => rows.find((r) => r.metric === k);
  const tile = (k: MetricRow["metric"]): StatTile[] => {
    const r = by(k);
    return r ? [{ label: copy.metric[k], value: r.value, signedValue: false, delta: r.yoy, deltaPeriod: "YoY" }] : [];
  };
  const d = driver(e);
  const tiles = d === "margin" ? [...tile("ebitda_margin"), ...tile("revenue")]
    : d === "pat" ? [...tile("revenue"), ...tile("pat")] : [...tile("revenue"), ...tile("ebitda_margin")];
  const metric = d === "margin" ? "ebitda_margin" : "revenue";
  const points = (e.trend ?? []).flatMap((q) => (q[metric] != null ? [{ period: q.period, value: q[metric]! }] : []));
  return { tiles: tiles.slice(0, 2),
    trend: points.length >= 3 ? { metric, label: copy.metric[metric], kind: metric === "revenue" ? "inr_cr" : "pct", points } : undefined };
}

/** Verdict from the numbers, largest surprise first. Template only: no model writes headlines. */
function resultsHeadline(e: DigestEvent): string {
  const r = e.results!;
  const m = r.ebitda_margin.yoy_bps ?? null;
  const rev = r.metrics.revenue?.yoy_pct ?? null;
  const pat = r.metrics.pat?.yoy_pct ?? null;
  const dir = (v: number) => (v < 0 ? "down" : "up");
  if (m != null && Math.abs(m) >= 150 && rev != null) {
    const against = (m < 0 && rev > 0) || (m > 0 && rev < 0);
    // The words carry the direction, so magnitudes are unsigned ("down 327 bps", not "down +327 bps").
    return `Margin ${dir(m)} ${Math.abs(Math.round(m)).toLocaleString("en-IN")} bps YoY ${against ? "despite" : "with"} revenue ${dir(rev)} ${fmtPct(Math.abs(rev), false)}`;
  }
  if (rev != null && pat != null && Math.abs(pat) >= 30)
    return `Revenue ${dir(rev)} ${fmtPct(Math.abs(rev), false)} YoY; profit after tax ${dir(pat)} ${fmtPct(Math.abs(pat), false)}`;
  if (rev != null) return `Revenue ${dir(rev)} ${fmtPct(Math.abs(rev), false)} YoY`;
  return `${r.period ?? "Latest"} results filed`;
}

function metrics(e: DigestEvent, src: SourceRef | null): MetricRow[] {
  const r = e.results!;
  const xbrl: SourceRef = { documentId: r.source, label: `${e.symbol}: ${r.period} results (XBRL, ${r.basis})`, publishedAt: e.at };
  const rows: MetricRow[] = [];
  const c = makeCalc(e);
  const withCalc = (n: NumValue | undefined, calc: ReturnType<typeof c.growth>) => (n && calc ? { ...n, calc } : n);
  const add = (metric: MetricRow["metric"], key: "revenue" | "ebitda" | "pbt" | "pat", label: string) => {
    const m = r.metrics[key];
    if (!m || m.value_cr == null) return;
    const fact = r.period ? c.src(r.period, key) : undefined;   // the XBRL element behind an extracted value
    rows.push({
      metric,
      value: key === "ebitda"
        ? { value: m.value_cr, kind: "inr_cr", epistemic: "CALCULATED", formula: EBITDA_FORMULA, source: xbrl, calc: c.ebitda(m.value_cr) }
        : { value: m.value_cr, kind: "inr_cr", epistemic: "EXTRACTED", source: fact ?? xbrl },
      qoq: withCalc(growth(m.qoq_pct, `${label} QoQ`), c.growth(key, "qoq", m.qoq_pct)),
      yoy: withCalc(growth(m.yoy_pct, `${label} YoY`), c.growth(key, "yoy", m.yoy_pct)),
    });
  };
  add("revenue", "revenue", "Revenue");
  add("ebitda", "ebitda", "EBITDA");
  if (r.ebitda_margin.pct != null) rows.push({
    metric: "ebitda_margin",
    value: { value: r.ebitda_margin.pct, kind: "pct", epistemic: "CALCULATED", formula: "EBITDA ÷ revenue", source: xbrl,
      calc: c.marginValue(r.ebitda_margin.pct) },
    qoq: withCalc(marginMove(r.ebitda_margin.qoq_bps, "last quarter"), c.marginMove("qoq", r.ebitda_margin.qoq_bps)),
    yoy: withCalc(marginMove(r.ebitda_margin.yoy_bps, "in the same quarter last year"), c.marginMove("yoy", r.ebitda_margin.yoy_bps)),
  });
  add("pbt", "pbt", "PBT");
  add("pat", "pat", "PAT");
  void src;
  return rows;
}

function exceptional(e: DigestEvent): NumValue | undefined {
  const w = e.results?.warnings.find((x) => x.includes("exceptional"));
  const m = w?.match(/₹(-?[\d,]+(?:\.\d+)?)/);
  if (!m) return undefined;
  return { value: Number(m[1].replace(/,/g, "")), kind: "inr_cr", epistemic: "EXTRACTED",
    source: { documentId: e.results!.source, label: `${e.symbol}: exceptional items (XBRL)`, publishedAt: e.at } };
}

/** One question per card from public evidence; asks for context, never unpublished information. */
function questionFor(e: DigestEvent): string {
  const r = e.results;
  // README §6.7: start from the gap. A thesis item that is behind (or missed) becomes the question.
  const hit = e.thesis?.find((t) => t.status === "behind" || t.status === "missed");
  if (hit) {
    const name = copy.ledger.metric[hit.metric] ?? "this metric";
    const what = name.startsWith("EBITDA") ? name : name.toLowerCase();
    return hit.source === "investor"
      ? `Is the shortfall in ${what} cyclical, or has something changed in the business?`
      : `What would ${e.name} need to change to reach its ${hit.deadline} ${what} guidance, and is that in management's hands?`;
  }
  if (r?.metrics?.revenue) {
    const m = r.ebitda_margin.yoy_bps;
    if (m != null && Math.abs(m) >= 100) return `What moved the margin ${fmtBps(m)} YoY: pricing, mix or input costs, and is it the same at peers?`;
    return "How much of this quarter's growth is volume and how much is price in this business?";
  }
  if (e.category === "management_change") return "What does a leader with this background usually prioritise in the first year?";
  if (e.category === "M&A") return `What does ${e.name} get from this deal that it couldn't build itself?`;
  if (e.kind === "move") return "What public developments in this sector could explain a move like this?";
  return `What would you ask ${e.name}'s management about this on the next call?`;
}

// ── cards ────────────────────────────────────────────────────────────────────────────
export function toCard(e: DigestEvent): Card {
  const src = sourceOf(e);
  const base = {
    id: e.id, companySymbol: e.symbol, companyName: e.name, category: e.category, at: e.at,
    score: e.score, reasons: e.reasons, question: questionFor(e),
    sources: distinctLabels([src, ...e.related.slice(0, 1).map((x) => ({ documentId: x.url, label: `${e.symbol}: ${x.title}`, publishedAt: e.at }))]
      .filter((x): x is SourceRef => !!x && !!x.documentId)
      .filter((x, i, all) => all.findIndex((y) => y.documentId === x.documentId) === i)),   // one link per document, told apart
  };
  const t = e.thesis?.[0];
  const assumption = t ? {
    ref: { id: t.id, text: t.text, source: t.source, deadline: t.deadline },
    stance: t.stance, status: t.status, claim: toClaim(t), rationale: t.evidence, epistemic: "CALCULATED" as const,
  } : undefined;
  if (e.results?.metrics && Object.keys(e.results.metrics).length) {
    const pc = e.promise_check;
    const rows = metrics(e, src);
    return { ...base, ...leadStats(e, rows), assumption, variant: "results", headline: resultsHeadline(e), period: e.results.period ?? "",
      metrics: rows, exceptional: exceptional(e),
      promiseCheck: pc ? {
        promiseId: pc.promise_id, guidedLow: pc.guided_low,
        guidedHigh: pc.guided_high ?? pc.guided_low,   // open-ended "at least" guidance: high === low
        unit: pc.unit,
        actual: { value: pc.actual, kind: "pct", epistemic: "CALCULATED",
          formula: `EBITDA ÷ revenue, ${pc.actual_quarters[0]}–${pc.actual_quarters[pc.actual_quarters.length - 1]} (year to date)` },
        quote: { documentId: pc.source, page: pc.page, label: `${e.symbol}: earnings call transcript`, publishedAt: pc.said_at },
      } : undefined };
  }
  // An appointee with a career extracted from the filing; one with a stated effective date first.
  const exec = EXECS.filter((x) => x.events.includes(e.id) && x.stints.length)
    .sort((a, b) => Number(Boolean(b.effective)) - Number(Boolean(a.effective)))[0];
  if (e.category === "management_change" && exec) {
    return { ...base, variant: "management_change",
      headline: `${exec.name} named ${exec.title ?? "to the board"}`,
      personName: exec.name, role: exec.title ?? exec.role, effective: exec.effective ?? undefined,
      profileQuote: exec.profile_quote,
      stints: exec.stints.map((s) => ({ org: s.org, role: s.role ?? undefined,
        from: s.start ?? undefined, to: s.start ? (s.end ?? undefined) : undefined })) };
  }
  if (e.kind === "move" && e.move) {
    const vol = e.move.volume_multiple, ret = e.move.return_pct;
    const unexplained = e.category === "unexplained_move";
    const tiles: StatTile[] = [
      ...(vol != null ? [{ label: copy.card.volumeVsAvg, value: { value: vol, kind: "ratio", epistemic: "CALCULATED",
        formula: "today's volume ÷ average of the previous 20 sessions" } as NumValue, signedValue: false }] : []),
      ...(ret != null ? [{ label: copy.card.priceChange, value: { value: ret, kind: "pct", epistemic: "CALCULATED",
        formula: "(close − previous close) ÷ previous close" } as NumValue, signedValue: true, deltaPeriod: copy.card.oneDay }] : []),
    ];
    return { ...base, tiles, variant: "anomaly",
      headline: vol != null && vol > 2
        ? `Volume ${vol.toFixed(1)}× normal${unexplained ? " with no filing" : ""}`
        : `Price ${ret != null && ret < 0 ? "down" : "up"} ${fmtPct(Math.abs(ret ?? 0), false)}${unexplained ? " with no filing" : ""}`,
      volumeRatio: vol != null ? { value: vol, kind: "ratio", epistemic: "CALCULATED", formula: "today's volume ÷ average of the previous 20 sessions" } : undefined,
      priceChange: ret != null ? { value: ret, kind: "pct", epistemic: "CALCULATED", formula: "(close − previous close) ÷ previous close" } : undefined,
      volume30d: e.volume30d ?? [], noFilingHours: e.no_filing_hours ?? 0 };
  }
  return { ...base, variant: "material", headline: e.summary || e.title, summary: e.title };
}

// ── digest ───────────────────────────────────────────────────────────────────────────
/** Snapshot events with price/volume moves re-detected at the investor's thresholds (defaults = as built). */
const withMoves = new Map<string, DigestEvent[]>();
export function eventsFor(t: Thresholds = DEFAULT_THRESHOLDS): DigestEvent[] {
  const k = `${t.volumeMultiple}|${t.priceMovePct}`;
  if (!withMoves.has(k)) {
    withMoves.set(k, k === `${DEFAULT_THRESHOLDS.volumeMultiple}|${DEFAULT_THRESHOLDS.priceMovePct}` ? EVENTS
      : [...EVENTS.filter((e) => e.kind !== "move"), ...moveEvents(movesData as unknown as MovesData, t)]);
  }
  return withMoves.get(k)!;
}

export function getDigest(asOf: string, hours: number, t?: Thresholds): DigestResponse & { all: DigestEvent[] } {
  const end = new Date(asOf).getTime();
  const start = end - hours * 3600_000;
  // The investor's per-type preferences: "alert" puts a type in Needs you (even routine ones),
  // "mute" keeps it out of Needs you (it still shows under Worth a read). Moves follow the thresholds.
  const inWin = eventsFor(t).filter((e) => { const x = new Date(e.at).getTime(); return x > start && x <= end; })
    .filter((e) => !t?.portfolio || t.portfolio.includes(e.symbol))   // your portfolio, once you have edited it
    .map((e) => {
      const p = t?.types?.[e.category];
      if (p === "alert" && e.bucket !== "needs_you")
        return { ...e, bucket: "needs_you" as const, reasons: [...e.reasons, copy.today.yourAlert(copy.category[e.category] ?? e.category)] };
      if (p === "mute" && e.bucket === "needs_you") return { ...e, bucket: "worth_a_read" as const };
      return e;
    });
  const by = (b: DigestEvent["bucket"]) => inWin.filter((e) => e.bucket === b).sort((a, z) => z.score - a.score);
  const needs = by("needs_you");
  const top = needs.slice(0, 5);
  const worth = [...needs.slice(5), ...by("worth_a_read")];
  const folded = by("collapsed");
  const groups = new Map<string, DigestResponse["collapsed"][number]>();
  for (const e of folded) {
    const g = groups.get(e.category) ?? { category: e.category, count: 0, items: [] };
    g.count += 1;
    const s = sourceOf(e);
    if (s) g.items.push({ id: e.id, title: `${e.symbol}: ${e.summary || e.title}`, source: s });
    groups.set(e.category, g);
  }
  const minutes = Math.round(folded.length * READ_MIN.folded + worth.length * READ_MIN.worth);
  return {
    window: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), replay: true },
    totals: { filings: inWin.filter((e) => e.kind === "filing").length, touched: top.length },
    readingEstimate: { minutes, formula: `${folded.length} folded × ${READ_MIN.folded} min + ${worth.length} one-liners × ${READ_MIN.worth} min (assumed reading times)` },
    needsYou: top.map(toCard),
    worthARead: worth.map((e) => ({
      id: e.id, companyName: `${e.name}`, at: e.at,
      summary: e.results?.period ? resultsHeadline(e) : (e.summary || e.title),
      source: sourceOf(e) ?? { documentId: "", label: `${e.symbol}: end-of-day prices`, publishedAt: e.at },
      // A price/volume move is not a filing: say so, and how long the company had been silent before it.
      ...(e.kind === "move" ? { move: { noFilingHours: e.no_filing_hours ?? null } } : {}),
    })),
    collapsed: [...groups.values()].sort((a, b) => b.count - a.count),
    all: inWin,
  };
}

// ── portfolio signals ────────────────────────────────────────────────────────────────
/** A short headline for a filing that isn't results or a known appointment: from the NSE subject,
 *  never the raw exchange text (which is long, legal and often a company's own boilerplate). */
function subjectHeadline(e: DigestEvent): string {
  if (e.category === "litigation") {
    const t = `${e.summary} ${e.related.map((r) => r.title).join(" ")}`;
    const fda = /\bu\.?s\.? ?fda\b|\busfda\b/i.test(t) ? "US FDA" : "Regulator";
    const outcome = [[/official action indicated|\boai\b/i, "Official Action Indicated"], [/voluntary action indicated|\bvai\b/i, "Voluntary Action Indicated"],
      [/no action indicated|\bnai\b/i, "No Action Indicated"], [/warning letter/i, "warning letter"], [/import alert/i, "import alert"],
      [/form[- ]?483|\b483\b/i, "Form 483 observations"]] as const;
    const hit = outcome.find(([re]) => re.test(t));
    if (hit) return hit[1].includes("Indicated") ? `${fda} inspection: ${hit[1]}` : `${fda} ${hit[1]}`;
    if (/inspection/i.test(t)) return `${fda} inspection outcome`;
  }
  return copy.subjectHeadline[e.title] ?? `${copy.category[e.category] ?? "Company"} filing`;
}

/** A written one-line headline for a filing: the card template, or a short headline from its NSE subject. */
export function filingHeadline(id: string): string | undefined {
  const e = getEvent(id);
  if (!e) return undefined;
  const c = toCard(e);
  return c.variant === "material" ? subjectHeadline(e) : c.headline;
}

/**
 * What the Portfolio row shows for a company, up to the end of the snapshot: the latest *important*
 * filing (never a routine one) as a headline, and an unusual price/volume move from the last 7 days.
 */
/** Moves shown on Portfolio are from this instant on (the last 7 days of the snapshot). */
export const MOVES_SINCE = new Date(new Date(EVENT_RANGE.last).getTime() - 7 * 864e5).toISOString();

export function companySignals(symbol: string) {
  const end = new Date(EVENT_RANGE.last).getTime(), weekStart = end - 7 * 864e5;
  const ev = EVENTS.filter((e) => e.symbol === symbol).sort((a, b) => b.at.localeCompare(a.at));
  // A filing that needed you this week outranks a later one that was only worth a read.
  const imp = ev.find((e) => e.kind === "filing" && e.bucket === "needs_you" && new Date(e.at).getTime() > weekStart)
    ?? ev.find((e) => e.kind === "filing" && e.bucket !== "collapsed");
  const mv = ev.find((e) => e.kind === "move" && e.move && new Date(e.at).getTime() > weekStart);
  const card = imp ? toCard(imp) : null;
  return {
    headline: imp && card ? { text: card.variant === "material" ? subjectHeadline(imp) : card.headline, at: imp.at, eventId: imp.id } : undefined,
    move: mv?.move ? { returnPct: mv.move.return_pct ?? undefined, volumeMultiple: mv.move.volume_multiple ?? undefined, at: mv.at, eventId: mv.id } : undefined,
    eventId: (imp ?? ev[0])?.id,
  };
}
