// Checks for "Explain this filing" (lib/filingExplain.ts), kept free of "@/" imports so `node --test` can load it.
import { unsupported } from "./numcheck.ts";

export type Page = { page: number; text: string };
export type Point = { text: string; quote: string; page: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹%.]+/g, " ").replace(/\s+/g, " ").trim();
const bare = (s: string) => s.replace(/(\d),(?=\d)/g, "$1");

/** Kept only if the quote (4+ words) is on the cited page, and every rupee/%/bps figure in the point is on
 *  that page, as written or as the bare number (tables print "₹ in crore" once, then plain numbers). */
export function check(p: Point, pages: Page[]): boolean {
  const page = pages.find((x) => x.page === p.page);
  if (!page || !p.text.trim()) return false;
  // PDF text extraction often breaks words ("comp r ehensive"), so the match ignores spaces entirely;
  // 4+ words and 20+ letters keep that from matching by accident.
  const q = norm(p.quote), squash = (x: string) => x.replace(/ /g, "");
  if (q.split(" ").length < 4 || squash(q).length < 20 || !squash(norm(page.text)).includes(squash(q))) return false;
  const pageBare = bare(page.text);
  return unsupported(p.text, [page.text]).every((f) => {
    const n = f.value.toFixed(f.decimals).replace(".", "\\.");
    return new RegExp(`(^|[^\\d.])${n}(?!\\d)`).test(pageBare);
  });
}
