import { copy } from "@/lib/copy";
import type { Epistemic } from "@/lib/types";

/** Small grey label that says how we know something: Said, Extracted, Calculated, FINN's read, Unknown. */
export default function EpistemicTag({ e, className = "" }: { e: Epistemic; className?: string }) {
  const t = copy.epistemic[e];
  return (
    <span title={t.hint} className={`inline-flex items-center rounded-full border border-line px-1.5 text-[11px] leading-[18px] text-ink-3 ${className}`}>
      {t.label}
      <span className="sr-only">: {t.hint}</span>
    </span>
  );
}
