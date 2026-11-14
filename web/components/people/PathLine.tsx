import { ChevronRight } from "lucide-react";
import { copy } from "@/lib/copy";

/** You → contact → person, with strength dots (1–4) and the template explanation. */
export default function PathLine({ steps, strength, confirmed, explanation }: {
  steps: string[]; strength: number; confirmed: boolean; explanation: string;
}) {
  const dots = Math.max(1, Math.min(4, Math.round(strength * 4 + 0.5)));
  return (
    <div className="mt-3">
      <p className="flex flex-wrap items-center gap-1 text-[13px] font-medium">
        {steps.map((s, i) => (
          <span key={`${s}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} className="text-ink-3" aria-hidden />}
            <span className={i === 0 ? "text-ink-3" : ""}>{s}</span>
          </span>
        ))}
      </p>
      <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-2">
        <span role="img" aria-label={copy.people.strength(dots)} className="inline-flex gap-0.5">
          {[1, 2, 3, 4].map((d) => (
            <span key={d} className={`h-1.5 w-1.5 rounded-full ${d <= dots ? "bg-ink-2" : "bg-line"}`} />
          ))}
        </span>
        {explanation}
        {!confirmed && <ProbableBadge />}
      </p>
    </div>
  );
}

export function ProbableBadge() {
  return (
    <span className="rounded-full border border-unclear/40 px-1.5 text-[11px] font-medium leading-5 text-unclear">
      {copy.people.probable}
    </span>
  );
}
