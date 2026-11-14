"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ProbableBadge } from "@/components/people/PathLine";
import Sheet from "@/components/shell/Sheet";
import { LATEST_DAY, asOfFor, callOpener, callQuestions, getEvent } from "@/lib/api";
import { copy } from "@/lib/copy";
import { date } from "@/lib/format";
import type { Suggestion } from "@/lib/network";
import { suggestionsFor } from "@/lib/people";
import { loadNetwork } from "@/lib/vault";

/**
 * Why this person, when you last spoke, three questions and a draft opener (FRONTEND.md §5.5).
 * Everything is computed on the device from the investor's own contacts; nothing is sent anywhere.
 */
export default function CallSheet({ open, onClose, eventId, contactId, day = LATEST_DAY }: {
  open: boolean; onClose: () => void; eventId: string; contactId: string; day?: string;
}) {
  const event = getEvent(eventId);
  const [s, setS] = useState<Suggestion | null | undefined>(undefined); // undefined = loading
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const openerRef = useRef<HTMLParagraphElement>(null);

  // Clipboard access can be refused (permissions, embedded browsers). Say so and select the text
  // so it can be copied by hand, rather than failing silently.
  const copyOpener = () => {
    const text = openerRef.current?.textContent ?? "";
    const selectIt = () => {
      const el = openerRef.current;
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    };
    if (!navigator.clipboard) { selectIt(); setCopied("failed"); return; }
    navigator.clipboard.writeText(text).then(() => setCopied("done")).catch(() => { selectIt(); setCopied("failed"); });
  };

  useEffect(() => {
    if (!event || !contactId) return;
    let live = true;
    loadNetwork()
      .then((contacts) => {
        const found = suggestionsFor(event.symbol, event.id, contacts, asOfFor(day)).find((x) => x.contact.id === contactId);
        if (live) setS(found ?? null);
      })
      .catch(() => { if (live) setS(null); });
    return () => { live = false; };
  }, [event, contactId, day]);

  const name = s?.contact.name ?? copy.call.loadingName;
  const opener = event && s ? callOpener(event, s.contact.name) : "";

  return (
    <Sheet open={open} onClose={onClose} kicker={copy.call.kicker(event?.symbol ?? "")} title={s === null ? copy.call.notFoundTitle : name}>
      {!event || s === null ? (
        <p className="text-[15px] text-ink-2">{copy.call.notFound}</p>
      ) : s === undefined ? (
        <div aria-busy="true" className="space-y-2">
          <div className="h-4 w-3/4 rounded bg-line" /><div className="h-4 w-1/2 rounded bg-line" />
          <div className="h-24 rounded bg-line" />
        </div>
      ) : (
        <>
          <h3 className="text-[13px] font-medium text-ink-3">{copy.call.why}</h3>
          <p className="mt-1 text-[15px]">{s.reason}{s.probable && <> <ProbableBadge /></>}</p>
          <p className="mt-1 text-[13px] text-ink-2">
            {s.contact.lastContacted ? copy.call.lastSpoke(date(s.contact.lastContacted, asOfFor(day))) : copy.call.neverLogged}
            {s.keepWarm && <span className="block">{copy.call.reconnect}</span>}
          </p>

          <h3 className="mt-4 text-[13px] font-medium text-ink-3">{copy.call.questions}</h3>
          <ol className="mt-1 list-decimal space-y-2 pl-5 text-[15px] leading-[22px]">
            {callQuestions(event, s.via).map((q) => <li key={q}>{q}</li>)}
          </ol>

          <h3 className="mt-4 text-[13px] font-medium text-ink-3">{copy.call.opener}</h3>
          <p ref={openerRef} className="mt-1 select-text rounded-[8px] bg-bg p-3 text-[15px] leading-[22px]">{opener}</p>
          <button type="button" onClick={copyOpener}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-3 text-[15px] font-medium">
            {copied === "done" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied === "done" ? copy.call.copied : copy.call.copy}
          </button>
          <p role="status" className={copied === "failed" ? "mt-1 text-[13px] text-unclear" : "sr-only"}>
            {copied === "done" ? copy.call.copied : copied === "failed" ? copy.call.copyFailed : ""}
          </p>

          <p className="mt-4 text-[11px] leading-4 text-ink-3">{copy.call.compliance}</p>
          <p className="mt-1 text-[11px] leading-4 text-ink-3">{copy.call.privacy}</p>
        </>
      )}
    </Sheet>
  );
}
