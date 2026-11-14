import Num from "@/components/trust/Num";
import { copy } from "@/lib/copy";
import { spoken } from "@/lib/format";
import type { StatTile } from "@/lib/types";

const dir = (n: number) => (n > 0 ? { arrow: "▲", cls: "text-supports" } : n < 0 ? { arrow: "▼", cls: "text-contradicts" } : { arrow: "", cls: "text-ink-2" });

/** Two lead stats: value, then a coloured ▲/▼ change with its period. Numbers stay tappable (formula or source). */
export default function StatTiles({ tiles }: { tiles: StatTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {tiles.map((t) => {
        const signedArrow = t.signedValue ? dir(t.value.value) : null;
        const d = t.delta ? dir(t.delta.value) : null;
        return (
          <div key={t.label} className="min-w-0 rounded-[8px] bg-bg px-3 py-2"
            aria-label={copy.card.tileLabel(t.label, spoken(t.value.kind, t.value.value, !!t.signedValue),
              t.delta ? `${spoken(t.delta.kind, t.delta.value, true)} ${t.deltaPeriod ?? ""}` : t.deltaPeriod)}>
            <p className="truncate text-[13px] text-ink-3">{t.label}</p>
            <p className={`text-[22px] font-medium leading-7 ${signedArrow?.cls ?? ""}`}>
              {signedArrow?.arrow && <span aria-hidden className="mr-1 text-[14px] align-middle">{signedArrow.arrow}</span>}
              <Num v={t.value} signed={!!t.signedValue} />
            </p>
            {t.delta && d ? (
              <p className={`text-[13px] font-medium ${d.cls}`}>
                <span aria-hidden className="mr-1">{d.arrow}</span><Num v={t.delta} />
                <span className="ml-1 font-normal text-ink-3">{t.deltaPeriod}</span>
              </p>
            ) : t.deltaPeriod && <p className="text-[13px] text-ink-3">{t.deltaPeriod}</p>}
          </div>
        );
      })}
    </div>
  );
}
