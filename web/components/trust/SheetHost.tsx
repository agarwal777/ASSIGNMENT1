"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { copy } from "@/lib/copy";
import { date } from "@/lib/format";
import { useSheetNav } from "@/lib/sheet";

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
  const { close } = useSheetNav();
  const sheet = q.get("sheet");
  // Stay mounted after the first sheet so later sheets animate in and out normally.
  const [used, setUsed] = useState(false);
  if (sheet && !used) setUsed(true);
  // Remember the last call so the sheet can animate out after its params leave the URL.
  const [call, setCall] = useState<{ event: string; contact: string } | null>(null);
  const ev = q.get("event"), ct = q.get("contact");
  if (sheet === "call" && ev && ct && (call?.event !== ev || call?.contact !== ct)) setCall({ event: ev, contact: ct });
  const [quote, setQuote] = useState<string | null>(null);
  const pr = q.get("promise");
  if (sheet === "quote" && pr && pr !== quote) setQuote(pr);
  if (!used && !sheet) return null;
  const doc = q.get("doc") ?? "";
  const label = q.get("label") ?? copy.sheet.untitledSource;
  const at = q.get("at");
  const page = q.get("page");
  const isUrl = /^https?:\/\//.test(doc);

  return (
    <>
      <Sheet open={sheet === "source"} onClose={close} kicker={copy.sheet.sourceKicker} title={label}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          {at && (<><dt className="text-ink-3">{copy.sheet.filed}</dt><dd>{date(at)}</dd></>)}
          {page && (<><dt className="text-ink-3">{copy.sheet.page}</dt><dd>{page}</dd></>)}
        </dl>
        <p className="mt-3 rounded-[8px] bg-bg p-3 text-[13px] text-ink-2">{copy.sheet.noExcerpt}</p>
        {isUrl && (
          <a href={doc} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-3 text-[15px] font-medium">
            <ExternalLink size={16} aria-hidden /> {copy.sheet.openOriginal}
          </a>
        )}
      </Sheet>

      <Sheet open={sheet === "formula"} onClose={close} kicker={copy.sheet.formulaKicker} title={copy.sheet.formulaTitle}>
        <p className="rounded-[8px] bg-bg p-3 text-[15px]">{q.get("text")}</p>
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
        <CallSheet open={sheet === "call"} onClose={close} eventId={call.event} contactId={call.contact}
          day={q.get("date") ?? undefined} />
      )}
      {quote && <QuoteSheet open={sheet === "quote"} onClose={close} promiseId={quote} />}
    </>
  );
}
