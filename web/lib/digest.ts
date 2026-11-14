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
  move?: { volume_multiple: number | null; return_pct: number | null };
  volume30d?: number[];
  no_filing_hours?: number | null;
  score: number;
  bucket: "needs_you" | "worth_a_read" | "collapsed";
  reasons: string[];
};
