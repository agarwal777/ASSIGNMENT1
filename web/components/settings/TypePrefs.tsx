"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { ALERT_TYPES, type TypePref } from "@/lib/moves";
import { loadThresholds, onThresholds, saveThresholds } from "@/lib/settings";

type Choice = TypePref | "auto";

/** Per announcement type: Alert / As scored / Mute. Each tap saves at once and re-ranks Today and Portfolio. */
export default function TypePrefs() {
  const [types, setTypes] = useState<Record<string, TypePref>>({});
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "failed">("loading");
  const s = copy.settings;

  useEffect(() => {
    let live = true;
    loadThresholds().then((t) => { if (live) { setTypes(t.types ?? {}); setState("idle"); } });
    const off = onThresholds((t) => { if (live) setTypes(t.types ?? {}); });
    return () => { live = false; off(); };
  }, []);

  const choose = (type: string, c: Choice) => {
    const next = { ...types };
    if (c === "auto") delete next[type]; else next[type] = c;
    setTypes(next);
    setState("saving");
    saveThresholds({ types: next }).then(() => setState("saved")).catch(() => setState("failed"));
  };

  return (
    <div>
      <ul className="divide-y divide-line rounded-[12px] border border-line bg-surface">
        {ALERT_TYPES.map((type) => {
          const cur: Choice = types[type] ?? "auto";
          return (
            <li key={type} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
              <span id={`type-${type}`} className="text-[15px]">{copy.category[type] ?? type}</span>
              <span role="radiogroup" aria-labelledby={`type-${type}`} className="flex rounded-full border border-line p-0.5">
                {(["alert", "auto", "mute"] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={cur === c} disabled={state === "loading"}
                    onClick={() => choose(type, c)}
                    className={`min-h-11 rounded-full px-3 text-[13px] ${cur === c ? "bg-ink font-medium text-bg" : "text-ink-2"}`}>
                    {s.typeOptions[c]}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className={`mt-1 min-h-5 text-[13px] ${state === "failed" ? "text-contradicts" : state === "saved" ? "text-supports" : "text-ink-3"}`}>
        {state === "saving" ? s.saving : state === "saved" ? s.saved : state === "failed" ? s.typesNeedMigration : ""}
      </p>
    </div>
  );
}
