// Shape of what /api/py/ensure_company returns for a company outside the snapshot, mapped into the
// QuarterRow contract so the same SnapshotTable renders it.
import type { QuarterRow, StreamEvent } from "@/lib/types";

export type EnsuredCompany = {
  symbol: string; name: string; basis: string | null; is_lender: boolean; notes: string[];
  transcripts_found: number | null; elapsed_s?: number;
  price: { close: number; day_change: number; as_of: string; days: number } | null;
  quarters: { period: string; revenue: number | null; pat: number | null; ebitda_margin: number | null;
    revenue_yoy: number | null; source: string; basis?: string; basis_fallback?: boolean }[];
};
/** The stream's `done` event carries the company payload (an addition to StreamEvent, §8 pattern). */
export type EnsureEvent = StreamEvent | { type: "done"; mode: "full" | "reduced"; company: EnsuredCompany };

/** The latest 4 quarters (8 are fetched so each has its year-ago comparison), one basis, fallbacks marked. */
export function toQuarterRows(c: EnsuredCompany, last = 4): QuarterRow[] {
  return c.quarters.slice(-last).map((q) => {
    // NSE XBRL file names carry the filing time (…_14082026065518_WEB.xml); otherwise it is left out.
    const st = q.source.match(/_(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})\d{2}_WEB\.xml$/i);
    const filed = st ? `${st[3]}-${st[2]}-${st[1]}T${st[4]}:${st[5]}:00+05:30` : "";
    const src = { documentId: q.source, label: `${c.symbol}: ${q.period} results (XBRL, ${q.basis ?? c.basis ?? "basis not stated"})`, publishedAt: filed };
    return {
      period: q.period, note: q.basis_fallback ? q.basis : undefined,
      revenue: q.revenue != null ? { value: q.revenue, kind: "inr_cr", epistemic: "EXTRACTED", source: src } : undefined,
      pat: q.pat != null ? { value: q.pat, kind: "inr_cr", epistemic: "EXTRACTED", source: src } : undefined,
      ebitdaMargin: q.ebitda_margin != null ? { value: q.ebitda_margin, kind: "pct", epistemic: "CALCULATED",
        formula: "EBITDA ÷ revenue, where EBITDA = profit before exceptional items and tax + finance costs + depreciation − other income", source: src } : undefined,
      revenueYoy: q.revenue_yoy != null ? { value: q.revenue_yoy, kind: "pct", epistemic: "CALCULATED",
        formula: "(revenue this quarter − same quarter last year) ÷ same quarter last year" } : undefined,
    } satisfies QuarterRow;
  });
}
