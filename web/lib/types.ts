// Contracts shared by the UI and the data layer.
// Section 1 is FRONTEND.md §7.2 verbatim (exported). Do not change it without sign-off.
// Section 2 adds the payloads §7.2 says "follow the same pattern" (company, portfolio,
// people, streams); these are additions, not changes to §7.2.

// ── 1. FRONTEND.md §7.2 ────────────────────────────────────────────────────────────
export type Stance = 'supports' | 'contradicts' | 'neutral' | 'insufficient';
export type Epistemic = 'SAID' | 'EXTRACTED' | 'CALCULATED' | 'INFERRED' | 'UNKNOWN';

export interface SourceRef { documentId: string; page?: number; span?: [number, number]; label: string; publishedAt: string; }
export interface NumValue { value: number; kind: 'inr_cr' | 'pct' | 'bps' | 'ratio' | 'count'; epistemic: Epistemic; source?: SourceRef; formula?: string; }

export interface PersonRef { contactId: string; displayName: string; reason: string; strength: number; confirmed: boolean; }
export interface AssumptionRef { id: string; text: string; source: 'management' | 'investor'; deadline?: string; }

export interface CardBase {
  id: string; companySymbol: string; companyName: string; category: string; at: string;
  headline: string; score: number; reasons: string[];
  assumption?: { ref: AssumptionRef; stance: Stance; rationale?: string; epistemic: Epistemic };
  person?: PersonRef; question?: string; sources: SourceRef[];
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
export type PromiseStatus = 'delivered' | 'on_track' | 'at_risk' | 'revised' | 'missed' | 'unverifiable';

export interface LedgerPromise {
  id: string; saidAt: string; deadline: string; metric: string; scope: string;
  quote: SourceRef & { text: string; speaker: string };
  guided?: { low?: number; high?: number; unit: string };
  status: PromiseStatus; evidence: string; actual?: NumValue; revisedBy?: string;
}
export interface QuarterRow { period: string; revenue?: NumValue; ebitdaMargin?: NumValue; pat?: NumValue; revenueYoy?: NumValue; }
export interface ThesisItem { ref: AssumptionRef; stance: Stance; evidence?: string; editable?: boolean }

export interface CompanyPayload {
  mode: 'full' | 'reduced';
  reducedReason?: string;
  symbol: string; name: string; sector: string;
  price?: { close: NumValue; dayChange: NumValue; asOf: string };
  credibility?: { delivered: number; resolved: number };
  thesis: { management: ThesisItem[]; investor: ThesisItem[] };
  ledger: LedgerPromise[];
  quarters: QuarterRow[];
  nextQuestion?: { text: string; people: PersonRef[] };
  recentFilings: { id: string; title: string; at: string; tier: 'needs_you' | 'worth_a_read' | 'collapsed'; source: SourceRef }[];
}

export interface PortfolioRow {
  symbol: string; name: string; sector: string;
  thesis: { stance: Stance }[];
  credibility?: { delivered: number; resolved: number };
  lastEvent?: { title: string; at: string; tier: 'needs_you' | 'worth_a_read' | 'collapsed' };
  needsYou: boolean;
}

export interface PathResult { target: string; people: (PersonRef & { kind: 'second_degree' | 'alumni' | 'peer'; probable: boolean })[] }

/** NDJSON events for unseen-ticker processing and bull vs bear (FRONTEND.md §8). */
export type StreamEvent =
  | { type: 'step'; id: string; status: 'running' | 'done' | 'failed' | 'skipped'; detail?: string }
  | { type: 'section'; side: 'bull' | 'bear'; text: string; citations: SourceRef[] }
  | { type: 'done'; mode: 'full' | 'reduced'; redirect?: string }
  | { type: 'error'; message: string };
