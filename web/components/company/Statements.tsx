import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { copy } from "@/lib/copy";
import type { StatementsView, StatRow } from "@/lib/statements";

/** Balance sheet and cash flow by period, and the segment mix. Sideways-scrolling tables, first column fixed. */
export default function Statements({ v }: { v: StatementsView }) {
  const t = copy.statements;
  return (
    <div className="space-y-4">
      {v.segments && (
        <figure className="m-0">
          <figcaption className="text-[13px] text-ink-3">{t.segments(v.segments.period)}</figcaption>
          <div role="img" aria-label={t.segmentsLabel(v.segments.items.map((x) => `${x.name} ${x.share.value}%`).join(", "))}
            className="mt-1.5 flex h-2.5 gap-[2px] overflow-hidden rounded-[3px]">
            {v.segments.items.map((x, i) => (
              <div key={x.name} className="bg-ink" style={{ flexGrow: x.share.value, opacity: Math.max(0.25, 1 - i * 0.2) }} />
            ))}
          </div>
          <ul className="mt-2 space-y-1 text-[13px]">
            {v.segments.items.map((x, i) => (
              <li key={x.name} className="flex items-baseline gap-2">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px] bg-ink" style={{ opacity: Math.max(0.25, 1 - i * 0.2) }} />
                <span className="min-w-0 flex-1 text-ink-2">{x.name}</span>
                <span className="shrink-0 tabular"><Num v={x.share} signed={false} /> · <Num v={x.revenue} signed={false} /></span>
              </li>
            ))}
          </ul>
        </figure>
      )}
      <Table title={t.balance} cols={v.balanceCols} rows={v.balance} />
      <Table title={t.cash} cols={v.flowCols} rows={v.flow} />
      <p className="text-[12px] leading-4 text-ink-3">{t.note(v.basis)}</p>
      {v.segments && <SourceLink s={v.segments.source} oneLine />}
    </div>
  );
}

function Table({ title, cols, rows }: { title: string; cols: string[]; rows: StatRow[] }) {
  return (
    <div>
      <h3 className="mb-1 text-[13px] text-ink-3">{title}</h3>
      <div className="overflow-x-auto" role="region" aria-label={title} tabIndex={0}>
        <table className="text-[14px] leading-5">
          <thead>
            <tr className="text-[13px] text-ink-3">
              <th scope="col" className="sticky left-0 bg-bg pr-3 text-left font-medium" />
              {cols.map((c, i) => <th key={`${c}-${i}`} scope="col" className="whitespace-nowrap px-2 text-right font-medium">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <th scope="row" className="sticky left-0 bg-bg py-1 pr-3 text-left font-normal text-ink-2">
                  <span className="block whitespace-nowrap">{r.label}</span>
                  {r.hint && <span className="block whitespace-nowrap text-[11px] text-ink-3">{r.hint}</span>}
                </th>
                {r.values.map((x, i) => (
                  <td key={i} className="whitespace-nowrap px-2 text-right">
                    {x ? <Num v={x} signed={Boolean(r.signed)} /> : <span className="text-ink-3">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
