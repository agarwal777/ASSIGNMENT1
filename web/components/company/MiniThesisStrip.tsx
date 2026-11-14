import { copy } from "@/lib/copy";
import { STATUS, statusCounts, type Status } from "@/lib/status";

/** One small badge per tracked claim: the shared status icon and colour, plus a spoken summary. */
export default function MiniThesisStrip({ items }: { items: { status: Status }[] }) {
  if (items.length === 0) return <span className="text-[13px] text-ink-3">{copy.portfolio.noThesis}</span>;
  const label = statusCounts(items).map(({ status, n }) => `${n} ${STATUS[status].label.toLowerCase()}`).join(", ");
  return (
    <span role="img" aria-label={copy.portfolio.thesisLabel(label)} className="inline-flex gap-1">
      {items.map((i, k) => {
        const { Icon, text, bg } = STATUS[i.status];
        return (
          <span key={k} className={`flex h-5 w-5 items-center justify-center rounded-full ${text} ${bg}`}>
            <Icon size={12} strokeWidth={3} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}
