"use client";

import { FileText } from "lucide-react";
import { date } from "@/lib/format";
import { useSheetNav } from "@/lib/sheet";
import type { SourceRef } from "@/lib/types";

/** Filing title + date → source sheet. */
export function SourceLink({ s, refDate }: { s: SourceRef; refDate?: string }) {
  const { open } = useSheetNav();
  return (
    <button type="button"
      onClick={() => open("source", { doc: s.documentId, page: s.page, label: s.label, at: s.publishedAt })}
      className="inline-flex min-h-11 items-center gap-1.5 text-left text-[13px] font-medium text-ink-2 underline decoration-dotted underline-offset-4">
      <FileText size={14} aria-hidden className="shrink-0" />
      <span>{s.label} · {date(s.publishedAt, refDate)}</span>
    </button>
  );
}

/** [n]-style citation chip at the end of a sentence → source sheet. */
export function CitationChip({ n, s }: { n: number; s: SourceRef }) {
  const { open } = useSheetNav();
  return (
    <button type="button" aria-label={`Source ${n}: ${s.label}`}
      onClick={() => open("source", { doc: s.documentId, page: s.page, label: s.label, at: s.publishedAt })}
      className="ml-0.5 inline-flex min-h-11 min-w-8 items-center justify-center align-baseline text-[11px] font-medium text-accent">
      [{n}]
    </button>
  );
}
