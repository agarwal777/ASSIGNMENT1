"use client";

import { useState } from "react";
import { bps, pct, type DigestEvent } from "@/lib/digest";
import type { Suggestion } from "@/lib/network";

/** Questions come from the event's public evidence via templates. No model, no network data sent anywhere. */
export function questions(e: DigestEvent, s: Suggestion): string[] {
  const q: string[] = [];
  const r = e.results;
  if (r?.metrics && Object.keys(r.metrics).length) {
    const m = r.ebitda_margin;
    if (m.yoy_bps != null && Math.abs(m.yoy_bps) >= 100)
      q.push(`EBITDA margin moved ${bps(m.yoy_bps)} YoY to ${m.pct}%. Is that pricing, mix or input costs, and is it the same at peers?`);
    const rev = r.metrics.revenue?.yoy_pct;
    if (rev != null) q.push(`Revenue is ${pct(rev)} YoY. In this business, how much of that is usually volume versus price?`);
    if (r.warnings.some((w) => w.includes("exceptional")))
      q.push("How does the industry usually treat an exceptional item like this one: genuinely one-off, or recurring?");
  }
  if (e.category === "management_change" && s.via) {
    q.push(`What is ${s.via} like to work with, and what did they change in the roles you saw?`);
    q.push("What does a leader with that background usually prioritise in the first year?");
    q.push("How are leadership transitions like this usually received by teams and customers?");
  }
  if (e.category === "M&A") {
    q.push(`What does ${e.name} get from a deal like this that it couldn't build itself?`);
    q.push("How have similar deals in this sector worked out?");
  }
  if (e.kind === "move") {
    q.push("What public developments in this sector could explain a move like this?");
    q.push("How is demand in the sector looking from where you sit?");
  }
  q.push(`If you were me, what would you ask ${e.name}'s management on the next call?`);
  return [...new Set(q)].slice(0, 3);
}

function opener(e: DigestEvent, s: Suggestion): string {
  const first = s.contact.name.split(" ")[0];
  const hook = e.category === "results" ? `just reported its ${e.results?.period ?? "latest"} numbers`
    : e.category === "management_change" ? "announced a leadership change"
    : e.category === "M&A" ? "announced a deal"
    : e.kind === "move" ? "has been moving a lot"
    : "filed something I'm thinking about";
  return `Hi ${first}, hope you're well. ${e.name} ${hook}, and I'd value your read on the industry context. Do you have 15 minutes this week?`;
}

export default function CallSheet({ e, s, onClose }: { e: DigestEvent; s: Suggestion; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = opener(e, s);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Call sheet: ${s.contact.name}`}
      className="fixed inset-0 z-50 flex items-end bg-ink/30" onClick={onClose}>
      <div className="mx-auto w-full max-w-md rounded-t-2xl bg-paper p-5 pb-8 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-ink/50">Call sheet · {e.symbol}</p>
            <h3 className="mt-1 font-serif text-2xl">{s.contact.name}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-ink/50">×</button>
        </div>
        <p className="mt-2 text-sm">{s.reason}{s.probable && <span className="ml-1 text-ink/50">(probable)</span>}</p>
        {s.keepWarm && <p className="mt-1 text-xs text-ink/60">{s.keepWarm}</p>}

        <h4 className="mt-4 text-xs font-semibold uppercase tracking-widest text-ink/50">Three questions</h4>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
          {questions(e, s).map((q) => <li key={q}>{q}</li>)}
        </ol>

        <h4 className="mt-4 text-xs font-semibold uppercase tracking-widest text-ink/50">Opener (draft, you send it)</h4>
        <p className="mt-2 rounded bg-ink/5 p-3 text-sm">{text}</p>
        <button className="mt-2 text-sm underline"
          onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {})}>
          {copied ? "Copied" : "Copy opener"}
        </button>

        <p className="mt-4 text-[11px] text-ink/50">
          Ask for context and interpretation of public information, never for unpublished
          price-sensitive information. Matching ran on your device over your own contacts; no model saw them.
          Demo network: all people are synthetic.
        </p>
      </div>
    </div>
  );
}
