"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { copy } from "@/lib/copy";
import { activeCount, EMPTY_SCREEN, type Screen } from "@/lib/screen";

/** Search box, and a Filters panel: sector, minimum EBITDA margin / revenue growth / margin change, sort. */
export default function ScreenBar({ screen, onChange, sectors, shown, total }: {
  screen: Screen; onChange: (s: Screen) => void; sectors: string[]; shown: number; total: number;
}) {
  const [open, setOpen] = useState(false);
  // Inputs keep what was typed ("-", "1.") while the screen holds the parsed number.
  const [raw, setRaw] = useState({ minMargin: "", minGrowth: "", minMarginChange: "" });
  const t = copy.portfolio.screen;
  const n = activeCount(screen);
  const setNum = (k: keyof typeof raw, v: string) => {
    setRaw({ ...raw, [k]: v });
    const x = v.trim() === "" ? null : Number(v);
    onChange({ ...screen, [k]: x != null && Number.isFinite(x) ? x : null });
  };
  const clear = () => { setRaw({ minMargin: "", minGrowth: "", minMarginChange: "" }); onChange({ ...EMPTY_SCREEN, text: screen.text }); };

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-line bg-surface px-3">
          <Search size={18} aria-hidden className="shrink-0 text-ink-3" />
          <span className="sr-only">{t.searchLabel}</span>
          <input value={screen.text} onChange={(e) => onChange({ ...screen, text: e.target.value })} placeholder={t.placeholder}
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none" autoComplete="off" enterKeyHint="search" />
          {screen.text && (
            <button type="button" onClick={() => onChange({ ...screen, text: "" })} aria-label={t.clearSearch}
              className="-mr-2 flex h-11 w-9 items-center justify-center text-ink-3"><X size={16} aria-hidden /></button>
          )}
        </label>
        <button type="button" aria-expanded={open} aria-controls="screen-panel" onClick={() => setOpen(!open)}
          className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-medium ${
            n ? "border-accent text-accent" : "border-line text-ink-2"}`}>
          <SlidersHorizontal size={16} aria-hidden /> {t.filters}{n > 0 && ` · ${n}`}
        </button>
      </div>

      {open && (
        <div id="screen-panel" className="mt-2 space-y-2 rounded-[12px] border border-line bg-surface p-3 text-[13px]">
          <Field label={t.sector}>
            <select value={screen.sector} onChange={(e) => onChange({ ...screen, sector: e.target.value })}
              className="min-h-11 w-full rounded-[8px] border border-line bg-bg px-2 text-[15px]">
              <option value="">{t.anySector}</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <NumField label={t.minMargin} unit="%" value={raw.minMargin} onChange={(v) => setNum("minMargin", v)} />
          <NumField label={t.minGrowth} unit="%" value={raw.minGrowth} onChange={(v) => setNum("minGrowth", v)} />
          <NumField label={t.minMarginChange} unit="bps" value={raw.minMarginChange} onChange={(v) => setNum("minMarginChange", v)} />
          <Field label={t.sortBy}>
            <select value={screen.sort} onChange={(e) => onChange({ ...screen, sort: e.target.value as Screen["sort"] })}
              className="min-h-11 w-full rounded-[8px] border border-line bg-bg px-2 text-[15px]">
              {(["default", "margin", "growth", "marginChange"] as const).map((k) => <option key={k} value={k}>{t.sorts[k]}</option>)}
            </select>
          </Field>
          <p className="text-[12px] leading-4 text-ink-3">{t.note}</p>
          <div className="flex items-center justify-between">
            <span className="text-ink-2">{t.showing(shown, total)}</span>
            {n > 0 && <button type="button" onClick={clear} className="min-h-11 font-medium text-accent">{t.clear}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-ink-2">{label}</span>{children}</label>;
}

function NumField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-ink-2">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="any"
          className="tabular h-11 w-20 rounded-[8px] border border-line bg-bg px-2 text-right text-[16px]" />
        <span className="w-7 text-ink-3">{unit}</span>
      </span>
    </label>
  );
}
