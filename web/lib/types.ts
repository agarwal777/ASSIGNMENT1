// Contracts shared by the UI and the data layer.
// Section 1 is FRONTEND.md §7.2 verbatim (exported). Do not change it without sign-off.
// Section 2 adds the payloads §7.2 says "follow the same pattern" (company, portfolio,
// people, streams); these are additions, not changes to §7.2.

// ── 1. FRONTEND.md §7.2 ────────────────────────────────────────────────────────────
export type Stance = 'supports' | 'contradicts' | 'neutral' | 'insufficient';
export type Epistemic = 'SAID' | 'EXTRACTED' | 'CALCULATED' | 'INFERRED' | 'UNKNOWN';

export interface SourceRef { documentId: string; page?: number; span?: [number, number]; label: string; publishedAt: string;
  fact?: XbrlFact /* redesign: XBRL element behind a number */; text?: string /* verbatim excerpt, when we hold it */ }
export interface NumValue { value: number; kind: 'inr_cr' | 'pct' | 'bps' | 'ratio' | 'count'; epistemic: Epistemic; source?: SourceRef; formula?: string;
  calc?: Calc /* redesign: the formula with its real inputs */ }

export interface PersonRef { contactId: string; displayName: string; reason: string; strength: number; confirmed: boolean; }
export interface AssumptionRef { id: string; text: string; source: 'management' | 'investor'; deadline?: string; }

export interface CardBase {
  id: string; companySymbol: string; companyName: string; category: string; at: string;
  headline: string; score: number; reasons: string[];
  assumption?: { ref: AssumptionRef; stance: Stance; rationale?: string; epistemic: Epistemic;
                status?: PromiseStatus /* redesign: one status vocabulary */; claim?: Claim /* redesign: bullet chart */ };
  person?: PersonRef; question?: string; sources: SourceRef[];
  tiles?: StatTile[] /* redesign: lead stats */; trend?: Trend /* redesign: 3–5 quarter trend */;
}
export interface MetricRow { metric: 'revenue' | 'ebitda' | 'ebitda_margin' | 'pbt' | 'pat'; value: NumValue; qoq?: NumValue; yoy?: NumValue; }
export interface PromiseCheck { promiseId: string; guidedLow: number; guidedHigh: number; unit: string; actual: NumValue; quote: SourceRef; }

export type Card =
  | (CardBase & { variant: 'results'; period: string; metrics: MetricRow[]; exceptional?: NumValue; promiseCheck?: PromiseCheck })
  | (CardBase & { variant: 'management_change'; personName: string; role: string; effective: string; profileQuote?: string;
                  stints: { org: string; role?: string; from?: string; to?: string }[];
                  path?: { steps: string[]; strength: number; confirmed: boolean; explanation: string } })
  | (CardBase & { variant: 'anomaly'; volumeRatio?: NumValue; priceChange?: NumValue; volume30d: number[]; noFilingHours: number })
  | (CardBase & { variant: 'material'; summary: string; fields?: Record<string, string> });

export interface DigestResponse {
  window: { from: string; to: string; replay: boolean };
  totals: { filings: number; touched: number };
  readingEstimate?: { minutes: number; formula: string };
  needsYou: Card[];                       // ≤ 5
  worthARead: { id: string; companyName: string; summary: string; at: string; source: SourceRef }[];
  collapsed: { category: string; count: number; items: { id: string; title: string; source: SourceRef }[] }[];
}

// ── 2. Additions following the §7.2 pattern ────────────────────────────────────────
/** One reported XBRL fact: element name, the period it covers, unit and the value as filed. */
export interface XbrlFact { element: string; period: string; unit: string; value: number }
/** A formula with its real inputs; each input can open its source. */
export interface Calc { name: string; parts: (string | { text: string; source?: SourceRef })[]; result: string }
/** A lead stat on a card: the value, and its change with the period it is measured over. */
export interface StatTile { label: string; value: NumValue; signedValue?: boolean; delta?: NumValue; deltaPeriod?: string }
/** The key metric over the last 3–5 quarters, oldest first. */
export interface Trend { metric: 'revenue' | 'ebitda_margin'; label: string; kind: 'inr_cr' | 'pct'; points: { period: string; value: number }[] }

/** One vocabulary everywhere. met/missed only after the deadline; before it a shortfall is behind. */
export type PromiseStatus = 'on_track' | 'behind' | 'met' | 'missed' | 'cant_check';

export interface LedgerPromise {
  id: string; saidAt: string; deadline: string; metric: string; scope: string;
  quote: SourceRef & { text: string; speaker: string };
  guided?: { low?: number; high?: number; unit: string };
  status: PromiseStatus; evidence: string; actual?: NumValue; revisedBy?: string;
}
export interface QuarterRow { period: string; note?: string /* basis when it differs from the company's */; revenue?: NumValue; ebitdaMargin?: NumValue; pat?: NumValue; revenueYoy?: NumValue; }
/** A checkable claim as numbers, for the bullet chart: actual so far against the target. */
export interface Claim {
  metric: string; unit: 'pct' | 'pct_yoy'; deadline: string; status: PromiseStatus;
  target: number; targetHigh?: number; actual?: number; quartersReported?: number; quartersTotal?: number;
}
export interface ThesisItem { ref: AssumptionRef; stance: Stance; status: PromiseStatus; evidence?: string; editable?: boolean; claim?: Claim }

export interface CompanyPayload {
  mode: 'full' | 'reduced';
  reducedReason?: string;
  symbol: string; name: string; sector: string;
  price?: { close: NumValue; dayChange: NumValue; asOf: string };
  credibility?: { met: number; resolved: number };
  thesis: { management: ThesisItem[]; investor: ThesisItem[] };
  ledger: LedgerPromise[];
  quarters: QuarterRow[];
  nextQuestion?: { text: string; people: PersonRef[] };
  transcripts?: { count: number; since: string | null };
  recentFilings: { id: string; title: string; headline?: string; at: string; tier: 'needs_you' | 'worth_a_read' | 'collapsed'; source: SourceRef }[];
}

export interface PortfolioRow {
  symbol: string; name: string; shortName: string; sector: string;
  thesis: { status: PromiseStatus }[];
  claims: { label: string; claim: Claim }[];
  /** Latest important filing (never routine), as a written headline. */
  headline?: { text: string; at: string; eventId: string };
  move?: { returnPct?: number; volumeMultiple?: number; at: string; eventId: string };
  nextEvent?: { text: string; at: string; note?: string };
  eventId?: string;
  transcripts: { count: number; since: string | null };
  credibility?: { met: number; resolved: number };
  lastEvent?: { title: string; at: string; tier: 'needs_you' | 'worth_a_read' | 'collapsed' };
  needsYou: boolean;
}

export interface PathResult { target: string; people: (PersonRef & { kind: 'second_degree' | 'alumni' | 'peer'; probable: boolean })[] }

/** NDJSON events for unseen-ticker processing and bull vs bear (FRONTEND.md §8). */
export type StreamEvent =
  | { type: 'step'; id: string; status: 'running' | 'done' | 'failed' | 'skipped'; detail?: string }
  | { type: 'section'; side: 'bull' | 'bear'; text: string; citations: SourceRef[] }
  | { type: 'side_done'; side: 'bull' | 'bear'; kept: number }
  | { type: 'done'; mode: 'full' | 'reduced'; redirect?: string }
  | { type: 'error'; message: string };
