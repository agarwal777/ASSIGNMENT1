// Two links with the same label and date look like a duplicate even when they are different
// documents (NSE files a board meeting's outcome as several PDFs under one subject). When labels
// collide, say what each document is, read from its file name; failing that, number them.
// Alias-free so the Node tests can import it directly.
import type { SourceRef } from "./types";

/** "…/VOLTAS_RB_06112026165554_02SE_Directorssigned.pdf" → "Directors". Empty when nothing useful is left. */
export function documentName(url: string): string {
  const file = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? "");
  const words = file
    .replace(/\.[a-z0-9]+$/i, "")                                   // extension
    .replace(/^[A-Z0-9&-]+_[A-Z]{1,3}_\d{8,}_?/, "")               // SYMBOL_RB_<timestamp>_
    .replace(/signed$/i, "")                                        // "…Directorssigned"
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w) && !/^\d+SE$/i.test(w) && !/^(SE|signed|intimation)$/i.test(w))
    .map((w) => w.replace(/^\d+(SE)?/i, ""))
    .filter(Boolean);
  const name = words.join(" ").trim();
  return name.length >= 3 && name.length <= 60 ? name[0].toUpperCase() + name.slice(1) : "";
}

/** Same sources, with colliding labels made distinct. Labels that don't collide are left alone. */
export function distinctLabels(sources: SourceRef[]): SourceRef[] {
  const key = (s: SourceRef) => `${s.label}|${s.publishedAt.slice(0, 10)}`;
  const count = new Map<string, number>();
  for (const s of sources) count.set(key(s), (count.get(key(s)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return sources.map((s) => {
    if ((count.get(key(s)) ?? 0) < 2) return s;
    const n = (seen.get(key(s)) ?? 0) + 1;
    seen.set(key(s), n);
    const name = documentName(s.documentId);
    return { ...s, label: `${s.label} (${name || `document ${n}`})` };
  });
}
