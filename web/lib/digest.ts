// Shape of web/data/digest.json as written by workers/build_digest.py (raw snapshot data).
// Screens never use this directly: lib/api.ts maps it into the FRONTEND.md §7.2 contracts.

export type RawMetric = { value_cr: number | null; qoq_pct: number | null; yoy_pct: number | null };
export type RawResults = {
  period: string | null;
  basis: string;
  metrics: Partial<Record<"revenue" | "ebitda" | "pbt" | "pat", RawMetric>>;
  ebitda_margin: { pct?: number | null; qoq_bps?: number | null; yoy_bps?: number | null };
  warnings: string[];
  source: string;
};
export type DigestEvent = {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  kind: "filing" | "move";
  category: string;
  at: string;
  title: string;
  summary: string;
  url: string | null;
  related: { title: string; url: string }[];
  results?: RawResults;
  trend?: { period: string; revenue: number | null; ebitda_margin: number | null }[];
  /** Reported facts behind the card's growth and margin numbers (this quarter, last quarter, a year ago). */
  inputs?: { periods: { cur: string; qoq: string; yoy: string }; facts: Record<string, Record<string, number>>;
    sources: Record<string, string | null>; assoc_inside: Record<string, boolean> } | null;
  move?: { volume_multiple: number | null; return_pct: number | null };
  volume30d?: number[];
  no_filing_hours?: number | null;
  /** The thesis item this event bears on most (behind or missed first), from workers/thesis.py. */
  thesis?: { id: string; text: string; deadline: string; metric: string; stance: "supports" | "contradicts" | "neutral" | "insufficient";
    status: "on_track" | "behind" | "met" | "missed" | "cant_check";
    target_low?: number | null; target_high?: number | null; actual?: number | null;
    quarters_reported?: number | null; quarters_total?: number | null;
    evidence: string; source: "investor" | "management"; demo?: boolean }[];
  /** Management's guidance for this fiscal year next to the year-to-date actual. */
  promise_check?: { promise_id: string; guided_low: number; guided_high: number | null; unit: string; actual: number;
    actual_quarters: string[]; said_at: string; page: number; source: string; met: boolean };
  components?: { M: number; S: number; T: number | null; N: number | null };
  score: number;
  bucket: "needs_you" | "worth_a_read" | "collapsed";
  reasons: string[];
};
