"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil } from "lucide-react";
import Sheet from "@/components/shell/Sheet";
import BulletChart from "@/components/trust/BulletChart";
import StatusPill from "@/components/trust/StatusPill";
import {
  assumptionText, checkAssumption, DEADLINES, loadAssumptions, METRICS, onAssumptions, saveAssumption, type AssumptionInput,
} from "@/lib/assumption";
import { copy } from "@/lib/copy";
import { useSheetNav } from "@/lib/sheet";
import type { QuarterRow, ThesisItem } from "@/lib/types";

/**
 * "Your assumptions": one editable investor assumption per company. The editor is a URL sheet
 * (?sheet=assumption), so the back gesture closes it. Saving updates this card at once (optimistic),
 * stores the row, and notifies Today and Portfolio through the shared store in lib/assumption.ts.
 */
export default function InvestorAssumption({ symbol, items, quarters, dataTo, seed }: {
  symbol: string; items: ThesisItem[]; quarters: QuarterRow[]; dataTo: string; seed: AssumptionInput | null;
}) {
  const id = items[0]?.ref.id ?? `inv-${symbol.toLowerCase()}-1`;
  const [stored, setStored] = useState<AssumptionInput | null>(null);
  const [pending, setPending] = useState<AssumptionInput | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const open = useSearchParams().get("sheet") === "assumption";
  const { open: openSheet, close } = useSheetNav();
  const a = copy.assumption;

  useEffect(() => {
    loadAssumptions();
    return onAssumptions((all) => setStored(all[symbol] ?? null));
  }, [symbol]);

  const mine = pending ?? stored;
  const current = mine ?? seed;
  const checked = current ? checkAssumption(current, quarters, dataTo) : null;

  const save = async (next: AssumptionInput) => {
    setPending(next);         // optimistic: chart and status move now
    close();
    setState("saving");
    try {
      await saveAssumption(symbol, id, next);   // the store notifies every screen with the stored row
      setState("saved");
    } catch {
      setState("failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] text-ink-3">{copy.company.yourAssumptions}</h3>
        <button type="button" onClick={() => openSheet("assumption", {})} aria-label={current ? a.edit : a.add}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-accent">
          <Pencil size={18} aria-hidden />
        </button>
      </div>
      {current && checked ? (
        <div className="mt-1 rounded-[12px] border border-line bg-surface p-3">
          <div className="flex items-start gap-2">
            <StatusPill status={checked.status} />
            <p className="min-w-0 text-[15px] leading-[22px]">{mine ? assumptionText(current) : items[0]?.ref.text ?? assumptionText(current)}</p>
          </div>
          <div className="mt-2"><BulletChart claim={checked.claim} label={assumptionText(current)} /></div>
        </div>
      ) : <p className="mt-1 text-[15px] text-ink-2">{copy.company.noAssumptions}</p>}
      <p role="status" aria-live="polite" className={`mt-1 min-h-5 text-[13px] ${state === "failed" ? "text-contradicts" : "text-ink-3"}`}>
        {state === "saving" ? a.saving : state === "saved" ? a.saved : state === "failed" ? a.failed : ""}
      </p>
      <Sheet open={open} onClose={close} title={current ? a.edit : a.add} kicker={a.kicker}>
        {open && <Form initial={current ?? { metric: "ebitda_margin", operator: ">=", target: 10, deadline: "FY27" }} onSave={save} />}
      </Sheet>
    </div>
  );
}

function Form({ initial, onSave }: { initial: AssumptionInput; onSave: (a: AssumptionInput) => void }) {
  const [f, setF] = useState({ ...initial, target: String(initial.target) });
  const t = Number(f.target);
  const valid = f.target.trim() !== "" && Number.isFinite(t) && t >= -100 && t <= 100;
  const a = copy.assumption;
  const field = "mt-1 h-11 w-full rounded-[8px] border border-line bg-bg px-2 text-[16px]";
  return (
    <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ ...f, target: t }); }}>
      <label htmlFor="as-metric" className="block text-[13px] text-ink-2">{a.metric}</label>
        <select id="as-metric" className={field} value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as AssumptionInput["metric"] })}>
          {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div><label htmlFor="as-op" className="block text-[13px] text-ink-2">{a.operator}</label>
          <select id="as-op" className={field} value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value as AssumptionInput["operator"] })}>
            <option value=">=">{a.atLeast}</option><option value="<=">{a.atMost}</option>
          </select></div>
        <div><label htmlFor="as-target" className="block text-[13px] text-ink-2">{a.target}</label>
          <input id="as-target" className={`${field} tabular text-right`} type="number" inputMode="decimal" step={0.5} value={f.target}
            onChange={(e) => setF({ ...f, target: e.target.value })} aria-invalid={!valid} /></div>
      </div>
      <label htmlFor="as-deadline" className="block text-[13px] text-ink-2">{a.deadline}</label>
        <select id="as-deadline" className={field} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })}>
          {DEADLINES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      <div className="h-2" />
      <p className="text-[13px] text-ink-3">{a.preview(assumptionText({ ...f, target: valid ? t : 0 }))}</p>
      <button type="submit" disabled={!valid}
        className="flex min-h-11 w-full items-center justify-center rounded-[8px] bg-accent text-[15px] font-medium text-surface disabled:opacity-40">
        {a.save}
      </button>
    </form>
  );
}
