"use client";

import { formatValue, spoken } from "@/lib/format";
import { useSheetNav } from "@/lib/sheet";
import type { NumValue } from "@/lib/types";

/**
 * The only way a number reaches the screen (FRONTEND.md §6.5). Formats it, gives it a spoken label,
 * and opens its formula (calculated values) or its source document when tapped.
 * `signed` = false for levels such as a margin; growth and changes are signed.
 */
export default function Num({ v, signed = true, className = "", tone = false }: {
  v: NumValue; signed?: boolean; className?: string; tone?: boolean;
}) {
  const { open } = useSheetNav();
  const text = formatValue(v.kind, v.value, signed);
  const label = spoken(v.kind, v.value, signed);
  const color = tone && signed ? (v.value < 0 ? "text-contradicts" : "") : "";
  const action = v.formula
    ? () => open("formula", { text: v.formula, label: v.source?.label, doc: v.source?.documentId, at: v.source?.publishedAt })
    : v.source
      ? () => open("source", { doc: v.source!.documentId, page: v.source!.page, label: v.source!.label, at: v.source!.publishedAt })
      : null;

  if (!action) {
    return <span className={`tabular ${color} ${className}`} aria-label={label}>{text}</span>;
  }
  return (
    <button type="button" onClick={action} aria-label={`${label}. ${v.formula ? "Show formula" : "Show source"}`}
      className={`tabular -my-2 inline-flex min-h-11 items-center underline decoration-dotted decoration-ink-3 underline-offset-4 ${color} ${className}`}>
      {text}
    </button>
  );
}
