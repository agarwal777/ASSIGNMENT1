import Num from "@/components/trust/Num";
import { copy } from "@/lib/copy";
import type { MetricRow, NumValue } from "@/lib/types";

/** Revenue, EBITDA, margin, PBT, PAT × Value · QoQ · YoY. Margins are levels (unsigned); changes are signed. */
export default function MetricTable({ metrics, exceptional }: { metrics: MetricRow[]; exceptional?: NumValue }) {
  return (
    <div className="mt-3">
      <table className="w-full text-[14px] leading-5">
        <caption className="sr-only">{copy.card.metricCaption}</caption>
        <thead>
          <tr className="text-left text-[13px] text-ink-3">
            <th scope="col" className="font-medium" />
            <th scope="col" className="text-right font-medium">{copy.card.value}</th>
            <th scope="col" className="text-right font-medium">{copy.card.qoq}</th>
            <th scope="col" className="text-right font-medium">{copy.card.yoy}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const level = m.metric === "ebitda_margin";
            return (
              <tr key={m.metric} className="border-t border-line">
                <th scope="row" className={`text-left font-normal ${level ? "text-ink-2" : ""}`}>{copy.metric[m.metric]}</th>
                <td className="pl-1.5 text-right"><Num v={m.value} signed={!level} /></td>
                <td className="pl-2 text-right">{m.qoq ? <Num v={m.qoq} /> : <Dash />}</td>
                <td className="pl-2 text-right">{m.yoy ? <Num v={m.yoy} /> : <Dash />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {exceptional && (
        <p className="mt-1 text-[13px] text-unclear">
          {copy.card.exceptional} <Num v={exceptional} />
        </p>
      )}
    </div>
  );
}

function Dash() {
  return <span className="text-ink-3" aria-label={copy.card.notAvailable}>—</span>;
}
