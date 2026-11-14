import TopBar from "@/components/shell/TopBar";
import { copy } from "@/lib/copy";

export default function AskPage() {
  return (
    <>
      <TopBar title={copy.ask.title} />
      <p className="px-4 py-6 text-ink-2">{copy.ask.empty}</p>
      <p className="px-4 text-[13px] text-ink-3">{copy.comingNext}</p>
    </>
  );
}
