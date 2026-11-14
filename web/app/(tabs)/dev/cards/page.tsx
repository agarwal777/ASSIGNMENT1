import TopBar from "@/components/shell/TopBar";
import EpistemicTag from "@/components/trust/EpistemicTag";
import Num from "@/components/trust/Num";
import { CitationChip, SourceLink } from "@/components/trust/SourceLink";
import { companyFixture, digestFixture, peopleFixture, portfolioFixture } from "@/fixtures";
import { copy } from "@/lib/copy";
import type { Epistemic, NumValue } from "@/lib/types";

// Review page for building blocks. Card variants are added here as each block lands (B2+).
export default function DevCards() {
  const results = digestFixture.needsYou[0];
  const nums: [string, NumValue, boolean?][] = results.variant === "results"
    ? results.metrics.flatMap((m) => [
        [`${m.metric} value`, m.value, m.metric !== "ebitda_margin"] as [string, NumValue, boolean],
        ...(m.yoy ? [[`${m.metric} YoY`, m.yoy, true] as [string, NumValue, boolean]] : []),
      ])
    : [];
  const tags: Epistemic[] = ["SAID", "EXTRACTED", "CALCULATED", "INFERRED", "UNKNOWN"];
  return (
    <>
      <TopBar title={copy.dev.title} />
      <div className="space-y-6 px-4 py-4">
        <p className="text-[13px] text-ink-3">{copy.dev.note}</p>

        <section>
          <h2 className="mb-2 text-[13px] font-medium text-ink-2">Num (tap: calculated → formula, extracted → source)</h2>
          <ul className="divide-y divide-line rounded-[12px] border border-line bg-surface">
            {nums.map(([k, v, signed]) => (
              <li key={k} className="flex items-center justify-between px-3">
                <span className="text-[13px] text-ink-2">{k}</span>
                <Num v={v} signed={signed ?? true} tone />
              </li>
            ))}
            <li className="flex items-center justify-between px-3">
              <span className="text-[13px] text-ink-2">no source (plain)</span>
              <Num v={{ value: 42, kind: "count", epistemic: "UNKNOWN" }} />
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-medium text-ink-2">Epistemic tags</h2>
          <div className="flex flex-wrap gap-2">{tags.map((t) => <EpistemicTag key={t} e={t} />)}</div>
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-medium text-ink-2">Sources and citations</h2>
          <SourceLink s={results.sources[0]} refDate={digestFixture.window.to} />
          <p className="text-[15px]">A sentence that ends with a citation<CitationChip n={1} s={results.sources[0]} /></p>
        </section>

        <section className="text-[13px] text-ink-2">
          <h2 className="mb-2 font-medium">Fixture inventory</h2>
          <p>Digest: {digestFixture.needsYou.length} cards ({digestFixture.needsYou.map((c) => c.variant).join(", ")}),
            {" "}{digestFixture.worthARead.length} worth a read, {digestFixture.collapsed.length} folded groups</p>
          <p>Portfolio: {portfolioFixture.length} companies · Company: {companyFixture.ledger.length} ledger promises ·
            People: {peopleFixture.people.length} paths ({peopleFixture.people.filter((p) => p.probable).length} probable)</p>
        </section>
      </div>
    </>
  );
}
