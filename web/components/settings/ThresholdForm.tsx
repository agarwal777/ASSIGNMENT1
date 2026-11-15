"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { DEFAULT_THRESHOLDS, THRESHOLD_LIMITS, type Thresholds } from "@/lib/moves";
import { loadThresholds, saveThresholds } from "@/lib/settings";

type State = "loading" | "idle" | "saving" | "saved" | "invalid" | "failed";

/** Two number inputs; each valid change saves after a short pause and says "Saved" inline. */
export default function ThresholdForm() {
  const [v, setV] = useState({ volume: DEFAULT_THRESHOLDS.volumeMultiple.toFixed(1), price: DEFAULT_THRESHOLDS.priceMovePct.toFixed(1) });
  const [state, setState] = useState<State>("loading");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const s = copy.settings;

  useEffect(() => {
    let live = true;
    loadThresholds().then((t) => {
      if (!live) return;
      setV({ volume: t.volumeMultiple.toFixed(1), price: t.priceMovePct.toFixed(1) });
      setState("idle");
    });
    return () => { live = false; };
  }, []);

  const parse = (x: { volume: string; price: string }): Thresholds | null => {
    const vol = Number(x.volume), price = Number(x.price);
    const ok = Number.isFinite(vol) && Number.isFinite(price) && vol >= THRESHOLD_LIMITS.volume.min && vol <= 20
      && price >= THRESHOLD_LIMITS.price.min && price <= 50;
    return ok ? { volumeMultiple: Math.round(vol * 10) / 10, priceMovePct: Math.round(price * 10) / 10 } : null;
  };

  const change = (key: "volume" | "price", value: string) => {
    const next = { ...v, [key]: value };
    setV(next);
    if (timer.current) clearTimeout(timer.current);
    const t = parse(next);
    if (!t) { setState("invalid"); return; }
    setState("saving");
    timer.current = setTimeout(() => {
      saveThresholds(t).then(() => setState("saved")).catch(() => setState("failed"));
    }, 600);
  };

  const status = { loading: s.loading, idle: "", saving: s.saving, saved: s.saved, invalid: s.invalid, failed: s.saveFailed }[state];
  return (
    <div>
      <ul className="divide-y divide-line rounded-[12px] border border-line bg-surface">
        <Field id="vol" label={s.volume} hint={s.volumeRule} prefix="" suffix="×" value={v.volume}
          min={THRESHOLD_LIMITS.volume.min} step={THRESHOLD_LIMITS.volume.step} disabled={state === "loading"}
          onChange={(x) => change("volume", x)} />
        <Field id="price" label={s.price} hint={s.priceRule} prefix="±" suffix={`% ${s.priceSuffix}`} value={v.price}
          min={THRESHOLD_LIMITS.price.min} step={THRESHOLD_LIMITS.price.step} disabled={state === "loading"}
          onChange={(x) => change("price", x)} />
      </ul>
      <p role="status" aria-live="polite" className={`mt-1 min-h-5 text-[13px] ${
        state === "invalid" || state === "failed" ? "text-contradicts" : state === "saved" ? "text-supports" : "text-ink-3"}`}>
        {status}
      </p>
    </div>
  );
}

function Field({ id, label, hint, prefix, suffix, value, min, step, disabled, onChange }: {
  id: string; label: string; hint: string; prefix: string; suffix: string; value: string; min: number; step: number;
  disabled: boolean; onChange: (v: string) => void;
}) {
  return (
    <li className="px-3 py-2">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={id} className="text-[15px]">{label}</label>
        <span className="flex items-center gap-1 text-[15px]">
          {prefix && <span aria-hidden>{prefix}</span>}
          <input id={id} type="number" inputMode="decimal" min={min} step={step} value={value} disabled={disabled}
            aria-describedby={`${id}-hint`} onChange={(e) => onChange(e.target.value)}
            className="tabular h-11 w-20 rounded-[8px] border border-line bg-bg px-2 text-right text-[16px] disabled:opacity-50" />
          <span className="text-[13px] text-ink-2">{suffix}</span>
        </span>
      </div>
      <p id={`${id}-hint`} className="text-[12px] leading-4 text-ink-3">{hint}</p>
    </li>
  );
}
