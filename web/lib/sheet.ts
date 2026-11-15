"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

// Sheets live in the URL (FRONTEND.md §3): ?sheet=<name>&<params>. Opening pushes a history entry,
// so the browser back gesture closes the sheet. Params are read from window.location at click
// time, so components that only *open* sheets need no useSearchParams (and no Suspense boundary).

import type { SourceRef } from "@/lib/types";

/** URL params for the source sheet: the document, and the XBRL fact or verbatim excerpt when we hold one. */
export function sourceParams(s: SourceRef): Record<string, string | number | undefined> {
  return { doc: s.documentId, page: s.page, label: s.label, at: s.publishedAt,
    el: s.fact?.element, per: s.fact?.period, unit: s.fact?.unit, val: s.fact?.value,
    excerpt: s.text ? s.text.slice(0, 600) : undefined };
}

export type SheetName = "source" | "formula" | "call" | "quote" | "assumption";
const SHEET_KEYS = ["sheet", "doc", "page", "label", "at", "text", "event", "contact", "about", "promise", "src", "calc", "el", "per", "unit", "val", "excerpt"];

let openedInApp = false; // true when the current sheet was opened by a tap (so back() is safe)

export function useSheetNav() {
  const router = useRouter();
  const pathname = usePathname();

  const open = useCallback((sheet: SheetName, params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams(window.location.search);
    SHEET_KEYS.forEach((k) => q.delete(k));
    q.set("sheet", sheet);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
    openedInApp = true;
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  }, [router, pathname]);

  const close = useCallback(() => {
    if (openedInApp) {
      openedInApp = false;
      router.back();
      return;
    }
    // Deep-linked straight into a sheet: there is no in-app history to go back to.
    const q = new URLSearchParams(window.location.search);
    SHEET_KEYS.forEach((k) => q.delete(k));
    const rest = q.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [router, pathname]);

  return { open, close };
}
