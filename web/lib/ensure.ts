// Shape of what /api/py/ensure_company returns for a company outside the snapshot, mapped into the
// QuarterRow contract so the same SnapshotTable renders it.
import type { QuarterRow, StreamEvent } from "@/lib/types";

export type EnsuredCompany = {
  symbol: string; name: string; basis: string | null; is_lender: boolean; notes: string[];
  transcripts_found: number | null; elapsed_s?: number;
  price: { close: number; day_change: number; as_of: string; days: number } | null;
  quarters: { period: string; revenue: number | null; pat: number | null; ebitda_margin: number | null;
    revenue_yoy: number | null; source: string }[];
};
/** The stream's `done` event carries the company payload (an addition to StreamEvent, §8 pattern). */
export type EnsureEvent = StreamEvent | { type: "done"; mode: "full" | "reduced"; company: EnsuredCompany };

export function toQuarterRows(c: EnsuredCompany): QuarterRow[] {
  return c.quarters.map((q) => {
    // The function doesn't return filing dates; an empty publishedAt is left out of the source sheet.
    const src = { documentId: q.source, label: `${c.symbol}: ${q.period} results (XBRL)`, publishedAt: "" };
    return {
      period: q.period,
      revenue: q.revenue != null ? { value: q.revenue, kind: "inr_cr", epistemic: "EXTRACTED", source: src } : undefined,
      pat: q.pat != null ? { value: q.pat, kind: "inr_cr", epistemic: "EXTRACTED", source: src } : undefined,
      ebitdaMargin: q.ebitda_margin != null ? { value: q.ebitda_margin, kind: "pct", epistemic: "CALCULATED",
        formula: "EBITDA ÷ revenue, where EBITDA = profit before exceptional items and tax + finance costs + depreciation − other income", source: src } : undefined,
      revenueYoy: q.revenue_yoy != null ? { value: q.revenue_yoy, kind: "pct", epistemic: "CALCULATED",
        formula: "(revenue this quarter − same quarter last year) ÷ same quarter last year" } : undefined,
    } satisfies QuarterRow;
  });
}
