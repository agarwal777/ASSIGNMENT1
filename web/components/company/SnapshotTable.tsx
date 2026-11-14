import Num from "@/components/trust/Num";
import { copy } from "@/lib/copy";
import { period } from "@/lib/format";
import type { QuarterRow } from "@/lib/types";

/** Up to 8 quarters × Revenue, EBITDA margin, PAT, revenue YoY. Scrolls sideways; first column stays. */
export default function SnapshotTable({ rows }: { rows: QuarterRow[] }) {
  const lines: { label: string; get: (q: QuarterRow) => QuarterRow["revenue"]; signed: boolean }[] = [
    { label: copy.metric.revenue, get: (q) => q.revenue, signed: false },
    { label: copy.company.revenueYoy, get: (q) => q.revenueYoy, signed: true },
    { label: copy.metric.ebitda_margin, get: (q) => q.ebitdaMargin, signed: false },
    { label: copy.metric.pat, get: (q) => q.pat, signed: false },
  ];
  return (
    <div className="-mx-4 overflow-x-auto px-4" role="region" aria-label={copy.company.snapshotLabel} tabIndex={0}>
      <table className="text-[14px] leading-5">
        <thead>
          <tr className="text-[13px] text-ink-3">
            <th scope="col" className="sticky left-0 bg-bg pr-3 text-left font-medium" />
            {rows.map((q) => <th key={q.period} scope="col" className="whitespace-nowrap px-2 text-right font-medium">{period(q.period)}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-t border-line">
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-bg pr-3 text-left font-normal text-ink-2">{l.label}</th>
              {rows.map((q) => {
                const v = l.get(q);
                return <td key={q.period} className="px-2 text-right">{v ? <Num v={v} signed={l.signed} /> : <span className="text-ink-3">—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
