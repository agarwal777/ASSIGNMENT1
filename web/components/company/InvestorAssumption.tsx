"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import Sheet from "@/components/shell/Sheet";
import BulletChart from "@/components/trust/BulletChart";
import StatusPill from "@/components/trust/StatusPill";
import {
  assumptionText, checkAssumption, DEADLINES, loadSavedAssumption, METRICS, saveAssumption, type AssumptionInput,
} from "@/lib/assumption";
import { copy } from "@/lib/copy";
import type { QuarterRow, ThesisItem } from "@/lib/types";

type Base = { id: string; input: AssumptionInput | null; item?: ThesisItem };

/**
 * "Your assumptions": one editable investor assumption per company. Saving updates the bullet chart and
 * status at once (optimistic), stores the row, then re-checks against what the database returned.
 */
export default function InvestorAssumption({ symbol, items, quarters, dataTo, seed }: {
  symbol: string; items: ThesisItem[]; quarters: QuarterRow[]; dataTo: string; seed: AssumptionInput | null;
}) {
  const base: Base = { id: items[0]?.ref.id ?? `inv-${symbol.toLowerCase()}-1`, input: seed, item: items[0] };
  const [mine, setMine] = useState<AssumptionInput | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const a = copy.assumption;

  useEffect(() => {
    let live = true;
    loadSavedAssumption(symbol).then((r) => { if (live && r) setMine(r); }).catch(() => { /* seed stays */ });
    return () => { live = false; };
  }, [symbol]);

  const current = mine ?? base.input;
  const checked = current ? checkAssumption(current, quarters, dataTo) : null;

  const save = async (next: AssumptionInput) => {
    const before = mine;
    setMine(next);            // optimistic: chart and status move now
    setOpen(false);
    setState("saving");
    try {
      setMine(await saveAssumption(symbol, base.id, next));   // re-check against the stored row
      setState("saved");
    } catch {
      setMine(before);
      setState("failed");
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] text-ink-3">{copy.company.yourAssumptions}</h3>
        <button type="button" onClick={() => setOpen(true)} aria-label={current ? a.edit : a.add}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-accent">
          <Pencil size={18} aria-hidden />
        </button>
      </div>
      {current && checked ? (
        <div className="mt-1 rounded-[12px] border border-line bg-surface p-3">
          <div className="flex items-start gap-2">
            <StatusPill status={checked.status} />
            <p className="min-w-0 text-[15px] leading-[22px]">{mine ? assumptionText(current) : base.item?.ref.text ?? assumptionText(current)}</p>
          </div>
          <div className="mt-2"><BulletChart claim={checked.claim} label={assumptionText(current)} /></div>
        </div>
      ) : <p className="mt-1 text-[15px] text-ink-2">{copy.company.noAssumptions}</p>}
      <p role="status" aria-live="polite" className={`mt-1 min-h-5 text-[13px] ${state === "failed" ? "text-contradicts" : "text-ink-3"}`}>
        {state === "saving" ? a.saving : state === "saved" ? a.saved : state === "failed" ? a.failed : ""}
      </p>
      <Sheet open={open} onClose={() => setOpen(false)} title={current ? a.edit : a.add} kicker={a.kicker}>
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
