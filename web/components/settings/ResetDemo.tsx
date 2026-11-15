"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { copy } from "@/lib/copy";

/**
 * Resets this visitor's demo: their alert thresholds and edited assumptions are deleted (back to the
 * defaults and the seeded assumptions), and their copy of the demo network is deleted and re-seeded.
 * RLS limits every delete to the visitor's own rows; the explicit user filter says so in the code too.
 */
export default function ResetDemo() {
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const reset = async () => {
    setState("working");
    try {
      const { ensureDemoSession, supabase } = await import("@/lib/supabase");
      const uid = await ensureDemoSession();
      for (const table of ["user_settings", "user_assumptions"]) {
        const { error } = await supabase.from(table).delete().eq("user_id", uid);
        if (error) throw error;
      }
      const [{ resetThresholds }, { resetAssumptions }] = await Promise.all([import("@/lib/settings"), import("@/lib/assumption")]);
      resetThresholds();
      resetAssumptions();
      const { error: delError } = await supabase.from("contacts").delete().eq("is_synthetic", true);
      if (delError) throw delError;
      const { error: seedError } = await supabase.rpc("seed_demo_user");
      if (seedError) throw seedError;
      setState("done");
    } catch {
      setState("failed");
    }
  };
  return (
    <div>
      <button type="button" onClick={reset} disabled={state === "working"}
        className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-3 text-[15px] font-medium disabled:opacity-50">
        <RotateCcw size={16} aria-hidden /> {copy.settings.reset}
      </button>
      <p role="status" className="mt-1 text-[13px] text-ink-2">
        {state === "working" ? copy.settings.resetting : state === "done" ? copy.settings.resetDone : state === "failed" ? copy.settings.resetFailed : ""}
      </p>
    </div>
  );
}
