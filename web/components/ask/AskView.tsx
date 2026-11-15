"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, CircleDashed, Loader, Minus, Search, X } from "lucide-react";
import SnapshotTable from "@/components/company/SnapshotTable";
import { ProbableBadge } from "@/components/people/PathLine";
import Num from "@/components/trust/Num";
import { copy } from "@/lib/copy";
import { toQuarterRows, type EnsureEvent, type EnsuredCompany } from "@/lib/ensure";
import { whoKnows, type Suggestion } from "@/lib/network";
import { executives, fracYear, orgs } from "@/lib/people";
import { useNdjsonStream } from "@/lib/useNdjsonStream";
import { loadNetwork } from "@/lib/vault";

type Sym = { s: string; n: string };
type Step = { id: string; status: "running" | "done" | "failed" | "skipped"; detail?: string };
const STEP_IDS = ["validate", "prices", "results", "transcripts"] as const;

/** Ticker search over the bundled NSE list (fetched on first focus, no server round trip per key). */
function useSymbols() {
  const [list, setList] = useState<Sym[] | null>(null);
  const load = () => { if (!list) fetch("/nse_equity_list.json").then((r) => r.json()).then(setList).catch(() => setList([])); };
  return { list, load };
}

function rank(list: Sym[], q: string): Sym[] {
  const u = q.trim().toUpperCase();
  if (!u) return [];
  const score = (x: Sym) => x.s === u ? 0 : x.s.startsWith(u) ? 1
    : x.n.toUpperCase().split(/\s+/).some((w) => w.startsWith(u)) ? 2 : x.n.toUpperCase().includes(u) ? 3 : 9;
  return list.map((x) => [score(x), x] as const).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].s.localeCompare(b[1].s))
    .slice(0, 8).map(([, x]) => x);
}

export default function AskView({ known, asOf }: { known: string[]; asOf: string }) {
  const q = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const intent = q.get("intent") === "who" ? "who" : "promises";
  const ticker = q.get("q");
  const setParams = (p: Record<string, string | null>) => {
    const n = new URLSearchParams(q.toString());
    for (const [k, v] of Object.entries(p)) { if (v == null) n.delete(k); else n.set(k, v); }
    router.replace(n.toString() ? `${pathname}?${n}` : pathname, { scroll: false });
  };

  return (
    <div className="px-4 pb-8 pt-3">
      <div role="tablist" aria-label={copy.ask.intentLabel} className="flex gap-2">
        {(["promises", "who"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={intent === k} onClick={() => setParams({ intent: k === "promises" ? null : k, q: null })}
            className={`min-h-11 rounded-full px-4 text-[13px] font-medium ${intent === k ? "bg-ink text-bg" : "border border-line text-ink-2"}`}>
            {copy.ask.intents[k]}
          </button>
        ))}
      </div>
      {intent === "promises"
        ? <CompanySearch known={known} ticker={ticker} onPick={(s) => known.includes(s) ? router.push(`/company/${encodeURIComponent(s)}`) : setParams({ q: s })} />
        : <WhoKnows asOf={asOf} initial={q.get("who") ?? ""} />}
    </div>
  );
}

function CompanySearch({ known, ticker, onPick }: { known: string[]; ticker: string | null; onPick: (s: string) => void }) {
  const { list, load } = useSymbols();
  const [text, setText] = useState("");
  const results = useMemo(() => (list ? rank(list, text) : []), [list, text]);
  return (
    <>
      <label className="mt-4 flex min-h-11 items-center gap-2 rounded-[8px] border border-line bg-surface px-3">
        <Search size={18} aria-hidden className="text-ink-3" />
        <span className="sr-only">{copy.ask.searchLabel}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onFocus={load} placeholder={copy.ask.placeholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none" autoCapitalize="characters" autoComplete="off" />
      </label>
      {results.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-[8px] border border-line bg-surface">
          {results.map((r) => (
            <li key={r.s}>
              <button onClick={() => { setText(""); onPick(r.s); }} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left">
                <span className="min-w-0"><span className="font-medium">{r.s}</span> <span className="text-[13px] text-ink-2">{r.n}</span></span>
                <span className="shrink-0 text-[11px] text-ink-3">{known.includes(r.s) ? copy.ask.inSnapshot : copy.ask.notInSnapshot}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {text && list && results.length === 0 && <p className="mt-2 text-[13px] text-ink-2">{copy.ask.noSymbol}</p>}
      {ticker ? <Unseen key={ticker} symbol={ticker} /> : !text && (
        <div className="mt-6">
          <p className="text-[15px] text-ink-2">{copy.ask.empty}</p>
          <ul className="mt-3 space-y-2">
            {copy.ask.suggestions.map((s) => (
              <li key={s.symbol}>
                <button onClick={() => onPick(s.symbol)} className="min-h-11 w-full rounded-[8px] border border-line bg-surface px-3 text-left text-[15px]">
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Live checklist while the server reads a company we didn't pick; ends in the reduced company view. */
function Unseen({ symbol }: { symbol: string }) {
  const { start, running } = useNdjsonStream<EnsureEvent>();
  const [steps, setSteps] = useState<Record<string, Step>>({});
  const [company, setCompany] = useState<EnsuredCompany | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = performance.now();
    const t = setInterval(() => setElapsed(Math.round((performance.now() - startedAt.current) / 1000)), 1000);
    start("/api/py/ensure_company", { symbol },
      (e) => {
        if (e.type === "step") setSteps((s) => ({ ...s, [e.id]: { id: e.id, status: e.status, detail: e.detail } }));
        else if (e.type === "done" && "company" in e) setCompany(e.company);
        else if (e.type === "error") setError(e.message);
      },
      (msg) => setError(msg)).finally(() => clearInterval(t));
    return () => clearInterval(t);
  }, [symbol, start]);

  return (
    <section aria-live="polite" className="mt-5">
      <h2 className="font-serif text-[19px]">{company?.name ?? symbol}</h2>
      {!company && (
        <ol className="mt-3 space-y-2">
          {STEP_IDS.map((id) => {
            const s = steps[id];
            const Icon = !s ? CircleDashed : s.status === "running" ? Loader : s.status === "done" ? Check : s.status === "skipped" ? Minus : X;
            return (
              <li key={id} className="flex items-start gap-2 text-[15px]">
                <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${s?.status === "running" ? "animate-spin text-accent"
                  : s?.status === "done" ? "text-supports" : s?.status === "failed" ? "text-contradicts" : "text-ink-3"}`} />
                <span>{copy.ask.steps[id]}{s?.detail && <span className="block text-[13px] text-ink-2">{copy.ask.stepDetail(id, s.detail)}</span>}</span>
              </li>
            );
          })}
        </ol>
      )}
      {running && <p className="mt-3 text-[13px] text-ink-3">{elapsed >= 60 ? copy.ask.slow : copy.ask.elapsed(elapsed)}</p>}
      {error && <p className="mt-3 text-[15px] text-ink-2">{error === "unknown_symbol" ? copy.ask.unknownSymbol : copy.ask.failed}</p>}
      {company && <Reduced c={company} />}
    </section>
  );
}

function Reduced({ c }: { c: EnsuredCompany }) {
  const rows = toQuarterRows(c);
  return (
    <div className="mt-2">
      {c.price && (
        <p className="text-[13px] text-ink-2">
          {c.symbol} · <Num v={{ value: c.price.close, kind: "inr", epistemic: "EXTRACTED" }} signed={false} />{" "}
          <Num v={{ value: c.price.day_change, kind: "pct", epistemic: "CALCULATED", formula: "(close − previous close) ÷ previous close" }} />
        </p>
      )}
      <p className="mt-3 rounded-[12px] border border-line bg-surface p-3 text-[15px] leading-[22px]">
        {c.is_lender ? copy.ask.reducedLender : copy.ask.reduced(c.transcripts_found)}
      </p>
      {rows.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1 text-[13px] font-medium text-ink-2">
            {copy.company.snapshot(rows.length)}{c.basis && <span className="font-normal text-ink-3"> · {copy.company.basis(c.basis)}</span>}
          </h3>
          <SnapshotTable rows={rows} />
          {rows.some((r) => !r.revenueYoy) && <p className="mt-1 text-[12px] text-ink-3">{copy.ask.noYoy}</p>}
        </section>
      )}
      {c.elapsed_s != null && <p className="mt-3 text-[11px] text-ink-3">{copy.ask.readIn(c.elapsed_s)}</p>}
    </div>
  );
}

/** Ranked people in your network who know a person or organisation. Matched on the device. */
function WhoKnows({ asOf, initial }: { asOf: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [found, setFound] = useState<Suggestion[] | null>(null);
  const tooShort = text.trim().length < 2;
  const results = tooShort ? null : found;   // derived, so no state reset inside the effect
  useEffect(() => {
    if (tooShort) return;
    let live = true;
    loadNetwork().then((c) => { if (live) setFound(whoKnows(text, c, executives, orgs, fracYear(asOf))); }).catch(() => { if (live) setFound([]); });
    return () => { live = false; };
  }, [text, asOf, tooShort]);
  return (
    <>
      <label className="mt-4 flex min-h-11 items-center gap-2 rounded-[8px] border border-line bg-surface px-3">
        <Search size={18} aria-hidden className="text-ink-3" />
        <span className="sr-only">{copy.ask.whoLabel}</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.ask.whoPlaceholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none" autoComplete="off" />
      </label>
      {!text && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {copy.ask.whoSuggestions.map((s) => (
            <li key={s}><button onClick={() => setText(s)} className="min-h-11 rounded-full border border-line px-3 text-[13px]">{s}</button></li>
          ))}
        </ul>
      )}
      {results && results.length === 0 && <p className="mt-3 text-[15px] text-ink-2">{copy.ask.whoNone}</p>}
      {results && results.length > 0 && (
        <ol className="mt-3 divide-y divide-line rounded-[12px] border border-line bg-surface">
          {results.slice(0, 8).map((s) => (
            <li key={s.contact.id} className="px-3 py-2">
              <p className="text-[15px] font-medium">{s.contact.name}{s.probable && <> <ProbableBadge /></>}</p>
              <p className="text-[13px] text-ink-2">{s.reason}</p>
              {s.keepWarm && <p className="text-[13px] text-ink-3">{copy.call.reconnect}</p>}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-[11px] text-ink-3">{copy.call.privacy}</p>
    </>
  );
}
