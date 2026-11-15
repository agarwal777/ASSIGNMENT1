"use client";

import { FileText } from "lucide-react";
import { date } from "@/lib/format";
import { sourceParams, useSheetNav } from "@/lib/sheet";
import type { SourceRef } from "@/lib/types";

/** Filing title + date → source sheet. */
export function SourceLink({ s, refDate, oneLine = false }: { s: SourceRef; refDate?: string; oneLine?: boolean }) {
  const { open } = useSheetNav();
  return (
    <button type="button"
      onClick={() => open("source", sourceParams(s))}
      className="inline-flex min-h-11 max-w-full min-w-0 items-center gap-1.5 text-left text-[13px] font-medium text-ink-2">
      <FileText size={14} aria-hidden className="shrink-0" />
      <span className={`${oneLine ? "truncate" : "line-clamp-2 [overflow-wrap:anywhere]"} min-w-0 underline decoration-line underline-offset-4`}>{s.label} · {date(s.publishedAt, refDate)}</span>
    </button>
  );
}

/** [n]-style citation chip at the end of a sentence → source sheet. 44 px tall to tap, without stretching the line. */
export function CitationChip({ n, s }: { n: number; s: SourceRef }) {
  const { open } = useSheetNav();
  return (
    <button type="button" aria-label={`Source ${n}: ${s.label}`}
      onClick={() => open("source", sourceParams(s))}
      className="-my-3 ml-0.5 inline-flex min-h-11 min-w-7 items-center justify-center align-baseline text-[11px] font-medium text-accent">
      [{n}]
    </button>
  );
}
