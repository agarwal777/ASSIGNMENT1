import { copy } from "@/lib/copy";

type Stint = { org: string; role?: string; from?: string; to?: string };
const SHOWN = 5;

function Item({ s }: { s: Stint }) {
  return (
    <li className="text-[13px] leading-[18px]">
      <span className="font-medium">{s.org}</span>
      {s.role && <span className="text-ink-2"> · {s.role}</span>}
      <span className="block text-ink-3">{s.from ? `${s.from}–${s.to ?? copy.people.now}` : copy.people.yearsNotStated}</span>
    </li>
  );
}

/** Career path from the filing's profile, in the filing's order. Missing years are said, not guessed.
 *  Long profiles (board seats) show the first five; the rest open in place. */
export default function StintList({ stints }: { stints: Stint[] }) {
  const rest = stints.slice(SHOWN);
  return (
    <div className="mt-2 border-l border-line pl-3">
      <ol className="space-y-1">{stints.slice(0, SHOWN).map((s, i) => <Item key={`${s.org}-${i}`} s={s} />)}</ol>
      {rest.length > 0 && (
        <details className="mt-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-accent">{copy.people.moreStints(rest.length)}</summary>
          <ol className="space-y-1">{rest.map((s, i) => <Item key={`${s.org}-${i + SHOWN}`} s={s} />)}</ol>
        </details>
      )}
    </div>
  );
}
