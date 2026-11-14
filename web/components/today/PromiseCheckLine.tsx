import Num from "@/components/trust/Num";
import { SourceLink } from "@/components/trust/SourceLink";
import { copy } from "@/lib/copy";
import type { PromiseCheck } from "@/lib/types";

/** "Guided 16–18% · delivered 15.0%": management's own number next to the reported one. */
export default function PromiseCheckLine({ check }: { check: PromiseCheck }) {
  const pctUnit = check.unit === "percent";
  const guided = (n: number) => <Num v={{ value: n, kind: pctUnit ? "pct" : "inr_cr", epistemic: "EXTRACTED", source: check.quote }} signed={false} />;
  const met = check.actual.value >= check.guidedLow && check.actual.value <= check.guidedHigh;
  return (
    <div className="mt-3 rounded-[8px] bg-bg px-3 py-1">
      <p className="flex flex-wrap items-center gap-x-1.5 text-[15px]">
        <span className="text-ink-2">{copy.card.guided}</span>
        {guided(check.guidedLow)}
        {check.guidedHigh !== check.guidedLow && <>–{guided(check.guidedHigh)}</>}
        <span aria-hidden className="text-ink-3">·</span>
        <span className="text-ink-2">{copy.card.delivered}</span>
        <Num v={check.actual} signed={false} />
        <span className={`text-[13px] font-medium ${met ? "text-supports" : "text-contradicts"}`}>
          {met ? copy.card.withinGuidance : copy.card.outsideGuidance}
        </span>
      </p>
      <SourceLink s={check.quote} />
    </div>
  );
}
