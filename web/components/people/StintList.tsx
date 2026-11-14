import { copy } from "@/lib/copy";

type Stint = { org: string; role?: string; from?: string; to?: string };

/** Career path from the filing's profile. Missing years are said, not guessed. */
export default function StintList({ stints }: { stints: Stint[] }) {
  return (
    <ol className="mt-2 space-y-1 border-l border-line pl-3">
      {stints.map((s, i) => (
        <li key={`${s.org}-${i}`} className="text-[13px] leading-[18px]">
          <span className="font-medium">{s.org}</span>
          {s.role && <span className="text-ink-2"> · {s.role}</span>}
          <span className="block text-ink-3">
            {s.from ? `${s.from}–${s.to ?? copy.people.now}` : copy.people.yearsNotStated}
          </span>
        </li>
      ))}
    </ol>
  );
}
