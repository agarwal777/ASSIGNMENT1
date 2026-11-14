import ResetDemo from "@/components/settings/ResetDemo";
import TopBar from "@/components/shell/TopBar";
import Num from "@/components/trust/Num";
import { copy } from "@/lib/copy";

// Read-only in the prototype (FRONTEND.md §5.6 scoped down): shows the rules FINN applies, where the
// data comes from, and what is synthetic. Editing thresholds is the next step.
export default function SettingsPage() {
  const s = copy.settings;
  return (
    <>
      <TopBar title={s.title} />
      <div className="space-y-6 px-4 py-4">
        <section>
          <h2 className="text-[13px] font-medium text-ink-2">{s.alerts}</h2>
          <ul className="mt-2 divide-y divide-line rounded-[12px] border border-line bg-surface">
            <li className="flex min-h-11 items-center justify-between px-3">
              <span>{s.volume}</span>
              <span><Num v={{ value: 2, kind: "ratio", epistemic: "CALCULATED", formula: s.volumeRule }} /> {s.volumeSuffix}</span>
            </li>
            <li className="flex min-h-11 items-center justify-between px-3">
              <span>{s.price}</span>
              <span>±<Num v={{ value: 5, kind: "pct", epistemic: "CALCULATED", formula: s.priceRule }} signed={false} /> {s.priceSuffix}</span>
            </li>
          </ul>
          <p className="mt-1 text-[13px] text-ink-3">{s.readOnly}</p>
        </section>

        <section>
          <h2 className="text-[13px] font-medium text-ink-2">{s.always}</h2>
          <p className="mt-1 text-[15px]">{s.alwaysList}</p>
        </section>

        <section>
          <h2 className="text-[13px] font-medium text-ink-2">{s.dataTitle}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] leading-[22px]">
            {s.data.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </section>

        <section>
          <h2 className="text-[13px] font-medium text-ink-2">{s.privacyTitle}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] leading-[22px]">
            {s.privacy.map((d) => <li key={d}>{d}</li>)}
          </ul>
        </section>

        <section>
          <h2 className="text-[13px] font-medium text-ink-2">{s.demoTitle}</h2>
          <p className="mt-1 text-[15px] text-ink-2">{copy.portfolio.syntheticNote}</p>
          <div className="mt-2"><ResetDemo /></div>
        </section>
      </div>
    </>
  );
}
