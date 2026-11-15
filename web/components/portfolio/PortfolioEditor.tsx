"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { copy } from "@/lib/copy";
import type { PortfolioRow } from "@/lib/types";

type Sym = { s: string; n: string };

/** NSE symbol search over the bundled list (same ranking as Ask). */
function rank(list: Sym[], q: string): Sym[] {
  const u = q.trim().toUpperCase();
  if (!u) return [];
  const score = (x: Sym) => x.s === u ? 0 : x.s.startsWith(u) ? 1
    : x.n.toUpperCase().split(/\s+/).some((w) => w.startsWith(u)) ? 2 : x.n.toUpperCase().includes(u) ? 3 : 9;
  return list.map((x) => [score(x), x] as const).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].s.localeCompare(b[1].s))
    .slice(0, 6).map(([, x]) => x);
}

/**
 * Edit the portfolio: every company in FINN with Add / Remove, any NSE symbol by search (those open
 * Ask's live view), and a way back to the demo portfolio. Each change saves at once.
 */
export default function PortfolioEditor({ all, symbols, edited, onChange, state }: {
  all: PortfolioRow[]; symbols: string[]; edited: boolean; onChange: (next: string[] | null) => void;
  state: "idle" | "saving" | "saved" | "failed";
}) {
  const t = copy.portfolio.editor;
  const [text, setText] = useState("");
  const [list, setList] = useState<Sym[] | null>(null);
  const load = () => { if (!list) fetch("/nse_equity_list.json").then((r) => r.json()).then(setList).catch(() => setList([])); };
  const results = useMemo(() => (list ? rank(list, text) : []), [list, text]);
  const inFinn = new Set(all.map((r) => r.symbol));
  const has = (s: string) => symbols.includes(s);
  const toggle = (s: string) => onChange(has(s) ? symbols.filter((x) => x !== s) : [...symbols, s]);
  const liveOnly = symbols.filter((s) => !inFinn.has(s));
  const sorted = [...all].sort((a, b) => Number(has(b.symbol)) - Number(has(a.symbol)) || a.shortName.localeCompare(b.shortName));

  return (
    <div id="portfolio-editor" className="mt-2 rounded-[12px] border border-line bg-surface p-3 text-[13px]">
      <label className="flex min-h-11 items-center gap-2 rounded-[8px] border border-line bg-bg px-3">
        <Search size={16} aria-hidden className="text-ink-3" />
        <span className="sr-only">{t.searchLabel}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onFocus={load} placeholder={t.placeholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none" autoCapitalize="characters" autoComplete="off" />
      </label>
      {results.length > 0 && (
        <ul className="mt-1 divide-y divide-line">
          {results.map((r) => (
            <li key={r.s}>
              <button type="button" onClick={() => { toggle(r.s); setText(""); }}
                className="flex min-h-11 w-full items-center gap-2 text-left">
                {has(r.s) ? <Check size={16} aria-hidden className="text-supports" /> : <Plus size={16} aria-hidden className="text-accent" />}
                <span className="min-w-0 flex-1"><span className="font-medium">{r.s}</span> <span className="text-ink-2">{r.n}</span></span>
                <span className="shrink-0 text-[11px] text-ink-3">{inFinn.has(r.s) ? t.inFinn : t.liveOnly}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-3 text-[13px] font-medium text-ink-2">{t.allTitle(all.length)}</h3>
      <p className="text-[12px] text-ink-3">{t.allNote}</p>
      <ul className="mt-1 divide-y divide-line">
        {sorted.map((r) => {
          const on = has(r.symbol);
          return (
            <li key={r.symbol} className="flex min-h-11 items-center gap-2 py-1">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.shortName}</span> <span className="text-ink-3">{r.symbol} · {r.sector}</span>
                {r.research && <span className="block text-[11px] text-ink-3">{t.researchNote}</span>}
              </span>
              <button type="button" onClick={() => toggle(r.symbol)} aria-pressed={on}
                aria-label={on ? t.removeLabel(r.shortName) : t.addLabel(r.shortName)}
                className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 font-medium ${
                  on ? "border-line text-ink-2" : "border-accent text-accent"}`}>
                {on ? <><Minus size={14} aria-hidden /> {t.remove}</> : <><Plus size={14} aria-hidden /> {t.add}</>}
              </button>
            </li>
          );
        })}
        {liveOnly.map((s) => (
          <li key={s} className="flex min-h-11 items-center gap-2 py-1">
            <span className="min-w-0 flex-1"><span className="font-medium">{s}</span> <span className="block text-[11px] text-ink-3">{t.liveOnlyNote}</span></span>
            <button type="button" onClick={() => toggle(s)} aria-label={t.removeLabel(s)}
              className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-line px-3 font-medium text-ink-2">
              <Minus size={14} aria-hidden /> {t.remove}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span role="status" aria-live="polite" className={state === "failed" ? "text-contradicts" : state === "saved" ? "text-supports" : "text-ink-3"}>
          {state === "saving" ? copy.settings.saving : state === "saved" ? copy.settings.saved : state === "failed" ? t.needMigration : ""}
        </span>
        {edited && <button type="button" onClick={() => onChange(null)} className="min-h-11 font-medium text-accent">{t.reset}</button>}
      </div>
    </div>
  );
}
