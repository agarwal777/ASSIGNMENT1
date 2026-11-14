"use client";

import { ExternalLink } from "lucide-react";
import ledgerData from "@/data/ledger.json";
import Sheet from "@/components/shell/Sheet";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { copy } from "@/lib/copy";
import { date, period } from "@/lib/format";

type RawPromise = {
  id: string; said_at: string; deadline_period: string; statement_verbatim: string; speaker_role: string;
  page: number; source: string; status: string; evidence: string; metric: string; scope?: string; revised_by?: string;
};
const ALL: RawPromise[] = Object.values(ledgerData as Record<string, { promises: RawPromise[] }>).flatMap((c) => c.promises);

/** The verbatim promise, who said it and where, and what the reported numbers say since. Loaded on demand. */
export default function QuoteSheet({ open, onClose, promiseId }: { open: boolean; onClose: () => void; promiseId: string }) {
  const p = ALL.find((x) => x.id === promiseId);
  const symbol = promiseId.split("-")[0];
  return (
    <Sheet open={open} onClose={onClose} kicker={copy.quote.kicker(symbol)}
      title={p ? (copy.ledger.metric[p.metric] ?? p.metric) : copy.quote.notFound}>
      {!p ? <p className="text-[15px] text-ink-2">{copy.quote.notFoundBody}</p> : (
        <>
          <blockquote className="border-l-2 border-line pl-3 font-serif text-[17px] leading-[24px]">
            “{p.statement_verbatim}”
          </blockquote>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <EpistemicTag e="SAID" /> {copy.quote.who(p.speaker_role, date(p.said_at), p.page)}
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-ink-3">{copy.quote.scope}</dt><dd>{p.scope ?? "company"}</dd>
            <dt className="text-ink-3">{copy.quote.deadline}</dt><dd>{p.deadline_period === "unspecified" ? copy.ledger.noDeadline : period(p.deadline_period)}</dd>
            <dt className="text-ink-3">{copy.quote.status}</dt><dd className="font-medium">{copy.ledger.status[p.status as keyof typeof copy.ledger.status]}</dd>
            <dt className="text-ink-3">{copy.quote.evidence}</dt><dd>{p.evidence}</dd>
          </dl>
          <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2"><EpistemicTag e="EXTRACTED" /> {copy.quote.howExtracted}</p>
          <a href={p.source} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line px-3 text-[15px] font-medium">
            <ExternalLink size={16} aria-hidden /> {copy.quote.openTranscript}
          </a>
        </>
      )}
    </Sheet>
  );
}
