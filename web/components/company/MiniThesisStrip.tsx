import { Check, CircleHelp, Minus, X } from "lucide-react";
import { copy } from "@/lib/copy";
import type { Stance } from "@/lib/types";

const DOT: Record<Stance, { Icon: typeof Check; cls: string }> = {
  supports: { Icon: Check, cls: "bg-supports/15 text-supports" },
  contradicts: { Icon: X, cls: "bg-contradicts/15 text-contradicts" },
  neutral: { Icon: Minus, cls: "bg-unclear/15 text-unclear" },
  insufficient: { Icon: CircleHelp, cls: "bg-unclear/15 text-unclear" },
};

/** One small badge per thesis item: shape and colour together, plus a spoken summary. */
export default function MiniThesisStrip({ items }: { items: { stance: Stance }[] }) {
  if (items.length === 0) return <span className="text-[13px] text-ink-3">{copy.portfolio.noThesis}</span>;
  const counts = items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.stance]: (a[i.stance] ?? 0) + 1 }), {});
  const label = Object.entries(counts).map(([s, n]) => `${n} ${copy.stance[s as Stance].toLowerCase()}`).join(", ");
  return (
    <span role="img" aria-label={copy.portfolio.thesisLabel(label)} className="inline-flex gap-1">
      {items.map((i, k) => {
        const { Icon, cls } = DOT[i.stance];
        return (
          <span key={k} className={`flex h-5 w-5 items-center justify-center rounded-full ${cls}`}>
            <Icon size={12} strokeWidth={3} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}
