import BulletChart from "@/components/trust/BulletChart";
import type { Claim } from "@/lib/types";
import TopBar from "@/components/shell/TopBar";
import EpistemicTag from "@/components/trust/EpistemicTag";
import Num from "@/components/trust/Num";
import { CitationChip, SourceLink } from "@/components/trust/SourceLink";
import EventCard from "@/components/today/EventCard";
import { companyFixture, digestFixture, materialCardFixture, peopleFixture, portfolioFixture } from "@/fixtures";
import { copy } from "@/lib/copy";
import type { Card, Epistemic, NumValue } from "@/lib/types";

// The management card again, with years missing from the filing: path is "probable".
const mgmt = digestFixture.needsYou[1];
const probableVariant: Card = mgmt.variant === "management_change" ? {
  ...mgmt, id: "fx-northwind-cfo-probable", headline: "New CFO; the link to her is not confirmed",
  stints: [{ org: "Rival Appliances (example)", role: "Finance head" }],
  path: { steps: ["You", "Tarun P. (example)", "Asha V. (example)"], strength: 0.25, confirmed: false,
    explanation: "Both worked at Rival Appliances; overlap not confirmed" },
  person: { contactId: "fx-c3", displayName: "Tarun P. (example)", reason: "Both worked at Rival Appliances; overlap not confirmed", strength: 0.25, confirmed: false },
} : mgmt;

// Review page for building blocks. Card variants are added here as each block lands (B2+).
const BULLETS: { label: string; claim: Claim }[] = [
  { label: "EBITDA margin at least 16%", claim: { metric: "ebitda_margin", unit: "pct", deadline: "FY27", status: "on_track", target: 16, actual: 17.2, quartersReported: 2, quartersTotal: 4 } },
  { label: "EBITDA margin at least 15%", claim: { metric: "ebitda_margin", unit: "pct", deadline: "FY27", status: "behind", target: 15, actual: 13.8, quartersReported: 2, quartersTotal: 4 } },
  { label: "EBITDA margin 20–21%", claim: { metric: "ebitda_margin", unit: "pct", deadline: "FY26", status: "met", target: 20, targetHigh: 21, actual: 20.2, quartersReported: 4, quartersTotal: 4 } },
  { label: "Revenue growth at least 10%", claim: { metric: "revenue_growth", unit: "pct_yoy", deadline: "FY27", status: "behind", target: 10, actual: -3.4, quartersReported: 3, quartersTotal: 4 } },
  { label: "EBITDA margin at least 12%", claim: { metric: "ebitda_margin", unit: "pct", deadline: "FY28", status: "cant_check", target: 12 } },
];

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

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium text-ink-2">Event cards: results · management change · anomaly · material · probable path</h2>
          {[...digestFixture.needsYou, materialCardFixture, probableVariant].map((c) => (
            <EventCard key={c.id} card={c} refDate={digestFixture.window.to} />
          ))}
        </section>

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
          <h2 className="mb-2 text-[13px] font-medium text-ink-2">Bullet charts: on track · behind · range met · negative growth · no data</h2>
          <div className="space-y-4 rounded-[12px] border border-line bg-surface p-3">
            {BULLETS.map((b) => <BulletChart key={b.label} claim={b.claim} label={b.label} />)}
          </div>
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
