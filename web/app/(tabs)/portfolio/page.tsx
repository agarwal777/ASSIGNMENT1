import Link from "next/link";
import { ChevronRight } from "lucide-react";
import MiniThesisStrip from "@/components/company/MiniThesisStrip";
import TopBar from "@/components/shell/TopBar";
import { getPortfolio, SNAPSHOT_AS_OF } from "@/lib/companies";
import { copy } from "@/lib/copy";
import Num from "@/components/trust/Num";
import { date } from "@/lib/format";

// Server component: the portfolio list is static snapshot data, so no JavaScript ships for it.
export default function PortfolioPage() {
  const rows = getPortfolio();
  return (
    <>
      <TopBar title={copy.portfolio.title} right={<span className="text-[13px] text-ink-3">{copy.portfolio.count(rows.length)}</span>} />
      <p className="px-4 pt-3 text-[13px] text-ink-2">{copy.portfolio.sortNote}</p>
      <ul className="mt-2 divide-y divide-line border-y border-line bg-surface">
        {rows.map((r) => (
          <li key={r.symbol}>
            <Link href={`/company/${encodeURIComponent(r.symbol)}`}
              className="flex min-h-11 items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {r.needsYou && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={copy.portfolio.needsYou} />}
                  <span className="truncate text-[15px] font-medium">{r.name}</span>
                </span>
                <span className="block text-[13px] text-ink-3">{r.symbol} · {r.sector}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <MiniThesisStrip items={r.thesis} />
                  {r.credibility && (
                    <span className="text-[13px] text-ink-2">
                      <Num v={{ value: r.credibility.met, kind: "count", epistemic: "CALCULATED" }} />/
                      <Num v={{ value: r.credibility.resolved, kind: "count", epistemic: "CALCULATED" }} />{" "}
                      {copy.portfolio.credibilitySuffix}
                    </span>
                  )}
                </span>
                {r.lastEvent && (
                  <span className="mt-1 block truncate text-[13px] text-ink-2">
                    {r.lastEvent.title} · {date(r.lastEvent.at, SNAPSHOT_AS_OF)}
                  </span>
                )}
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-4 py-4 text-[13px] text-ink-3">{copy.portfolio.syntheticNote}</p>
    </>
  );
}
