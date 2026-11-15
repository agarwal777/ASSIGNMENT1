"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { copy } from "@/lib/copy";
import { date } from "@/lib/format";
import { sourceParams, useSheetNav } from "@/lib/sheet";
import type { Calc } from "@/lib/types";

// vaul (~25 KB gzipped) loads only when a sheet is first opened, not with every screen.
const Sheet = dynamic(() => import("@/components/shell/Sheet"));
const CallSheet = dynamic(() => import("@/components/people/CallSheet"));
const QuoteSheet = dynamic(() => import("@/components/company/QuoteSheet"));

/**
 * Renders whichever sheet the URL names (?sheet=source|formula|call|quote). Mounted once in the
 * shell inside <Suspense>, because reading search params makes this subtree client-rendered (Next 16).
 * Every sheet's code loads on first use, so screens don't pay for sheets they never open.
 */
export default function SheetHost() {
  const q = useSearchParams();
  const { close, open } = useSheetNav();
  const sheet = q.get("sheet");
  // Stay mounted after the first sheet so later sheets animate in and out normally.
  const [used, setUsed] = useState(false);
  if (sheet && !used) setUsed(true);
  // Remember the last call so the sheet can animate out after its params leave the URL.
  // With an event (Today, Company) or, from Ask's "Who knows", about what was searched.
  const [call, setCall] = useState<{ event: string; contact: string; about: string } | null>(null);
  const ev = q.get("event") ?? "", ct = q.get("contact"), ab = q.get("about") ?? "";
  if (sheet === "call" && ct && (ev || ab) && (call?.event !== ev || call?.contact !== ct || call?.about !== ab))
    setCall({ event: ev, contact: ct, about: ab });
  const [quote, setQuote] = useState<string | null>(null);
  const pr = q.get("promise");
  if (sheet === "quote" && pr && pr !== quote) setQuote(pr);
  if (!used && !sheet) return null;
  const doc = q.get("doc") ?? "";
  const label = q.get("label") ?? copy.sheet.untitledSource;
  const at = q.get("at");
  const page = q.get("page");
  const isUrl = /^https?:\/\//.test(doc);
  const el = q.get("el"), per = q.get("per"), unit = q.get("unit"), val = q.get("val"), excerpt = q.get("excerpt");
  const calc: Calc | null = (() => { try { const c = q.get("calc"); return c ? (JSON.parse(c) as Calc) : null; } catch { return null; } })();

  return (
    <>
      <Sheet open={sheet === "source"} onClose={close} kicker={copy.sheet.sourceKicker} title={label}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          {at && (<><dt className="text-ink-3">{copy.sheet.filed}</dt><dd>{date(at)}</dd></>)}
          {page && (<><dt className="text-ink-3">{copy.sheet.page}</dt><dd>{page}</dd></>)}
        </dl>
        {el ? (
          // A reported XBRL fact: what the filing actually says, element by element.
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-[8px] bg-bg p-3 text-[13px]">
            <dt className="text-ink-3">{copy.sheet.element}</dt><dd className="min-w-0 font-mono text-[12px] [overflow-wrap:anywhere]">{el}</dd>
            {per && (<><dt className="text-ink-3">{copy.sheet.period}</dt><dd>{per}</dd></>)}
            {unit && (<><dt className="text-ink-3">{copy.sheet.unit}</dt><dd>{unit}</dd></>)}
            {val && (<><dt className="text-ink-3">{copy.sheet.value}</dt>
              <dd><span className="tabular">{copy.sheet.crore(Number(val) / 1e7)}</span>
                <span className="block text-ink-3">{copy.sheet.rounding}</span></dd></>)}
          </dl>
        ) : excerpt ? (
          <blockquote className="mt-3 rounded-[8px] border-l-2 border-line bg-bg p-3 text-[15px] italic leading-[22px] text-ink-2">
            “{excerpt}”
          </blockquote>
        ) : <p className="mt-3 rounded-[8px] bg-bg p-3 text-[13px] text-ink-2">{copy.sheet.noExcerpt}</p>}
        {isUrl && (
          <a href={doc} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-3 text-[15px] font-medium">
            <ExternalLink size={16} aria-hidden /> {copy.sheet.openOriginal}
          </a>
        )}
      </Sheet>

      <Sheet open={sheet === "formula"} onClose={close} kicker={copy.sheet.formulaKicker} title={copy.sheet.formulaTitle}>
        {calc ? (
          <div className="rounded-[8px] bg-bg p-3 text-[15px] leading-[26px]">
            <span className="font-medium">{calc.name}</span> ={" "}
            {calc.parts.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span> : p.source ? (
              <button key={i} type="button" onClick={() => open("source", sourceParams(p.source!))}
                className="tabular rounded-[4px] font-medium text-accent underline decoration-accent/40 underline-offset-4">{p.text}</button>
            ) : <span key={i} className="tabular font-medium">{p.text}</span>)}
            {" "}= <span className="tabular font-medium">{calc.result}</span>
          </div>
        ) : null}
        {q.get("text") && (
          <p className={calc ? "mt-2 text-[13px] text-ink-2" : "rounded-[8px] bg-bg p-3 text-[15px]"}>
            {calc && <span className="text-ink-3">{copy.sheet.definition} </span>}{q.get("text")}
          </p>
        )}
        {calc && <p className="mt-2 text-[13px] text-ink-3">{copy.sheet.tapInput}</p>}
        <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
          <EpistemicTag e="CALCULATED" /> {copy.sheet.formulaNote}
        </p>
        {isUrl && (
          <a href={doc} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium underline">
            <ExternalLink size={14} aria-hidden /> {label}{at ? ` · ${date(at)}` : ""}
          </a>
        )}
      </Sheet>

      {call && (
        <CallSheet open={sheet === "call"} onClose={close} eventId={call.event || undefined} about={call.about || undefined}
          contactId={call.contact} day={q.get("date") ?? undefined} asOf={q.get("at") ?? undefined} />
      )}
      {quote && <QuoteSheet open={sheet === "quote"} onClose={close} promiseId={quote} />}
    </>
  );
}
