import { Suspense } from "react";
import PortfolioDated from "@/components/portfolio/PortfolioDated";
import PortfolioView from "@/components/portfolio/PortfolioView";
import TopBar from "@/components/shell/TopBar";
import { LATEST_DAY, MOVES_SINCE, needsYouByDay } from "@/lib/api";
import { getPortfolio, SNAPSHOT_AS_OF } from "@/lib/companies";
import { copy } from "@/lib/copy";

// Rows are built on the server from the snapshot; "Needs you" follows Today's date (?date=, else
// the latest brief), and filtering and expanding happen on the device.
export default function PortfolioPage() {
  const rows = getPortfolio();
  const needs = needsYouByDay();
  return (
    <>
      <TopBar title={copy.portfolio.title} right={<span className="text-[13px] text-ink-3">{copy.portfolio.count(rows.length)}</span>} />
      <Suspense fallback={<PortfolioView rows={rows} refDate={SNAPSHOT_AS_OF} needs={needs[LATEST_DAY] ?? []} movesSince={MOVES_SINCE} />}>
        <PortfolioDated rows={rows} refDate={SNAPSHOT_AS_OF} needsByDay={needs} movesSince={MOVES_SINCE} />
      </Suspense>
    </>
  );
}
