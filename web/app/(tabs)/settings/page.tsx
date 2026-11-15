import ResetDemo from "@/components/settings/ResetDemo";
import ThresholdForm from "@/components/settings/ThresholdForm";
import TopBar from "@/components/shell/TopBar";
import { copy } from "@/lib/copy";

// Alert thresholds are editable and saved per user (RLS); the rest shows the rules FINN applies,
// where the data comes from, and what is synthetic.
export default function SettingsPage() {
  const s = copy.settings;
  return (
    <>
      <TopBar title={s.title} />
      <div className="space-y-6 px-4 py-4">
        <section>
          <h2 className="text-[13px] font-medium text-ink-2">{s.alerts}</h2>
          <p className="mt-1 text-[13px] text-ink-3">{s.thresholdsNote}</p>
          <div className="mt-2"><ThresholdForm /></div>
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
