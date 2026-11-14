import PortfolioView from "@/components/portfolio/PortfolioView";
import TopBar from "@/components/shell/TopBar";
import { getPortfolio, SNAPSHOT_AS_OF } from "@/lib/companies";
import { copy } from "@/lib/copy";

// Rows are built on the server from the snapshot; filtering and expanding happen on the device.
export default function PortfolioPage() {
  const rows = getPortfolio();
  return (
    <>
      <TopBar title={copy.portfolio.title} right={<span className="text-[13px] text-ink-3">{copy.portfolio.count(rows.length)}</span>} />
      <PortfolioView rows={rows} refDate={SNAPSHOT_AS_OF} />
    </>
  );
}
