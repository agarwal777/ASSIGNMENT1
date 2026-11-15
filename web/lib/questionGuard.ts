// The company question box's input rules, alias-free so `node --test` can load them.

export const QUESTION_MIN = 8;
export const QUESTION_MAX = 200;

/** One spelling per question for the shared cache: trimmed, single-spaced, lower case, no trailing "?". */
export function normalizeQuestion(q: string): string {
  return q.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase().replace(/[?.!\s]+$/, "");
}

/**
 * A name from the investor's own network, if the question contains one. The question is sent to a
 * model and stored for other visitors, and FINN never sends the network anywhere, so the browser
 * refuses before sending. Full names only (first names alone would block ordinary words).
 */
export function mentionsContact(question: string, names: string[]): string | null {
  const q = ` ${normalizeQuestion(question).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  for (const n of names) {
    const k = normalizeQuestion(n).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (k.includes(" ") && k.length >= 5 && q.includes(` ${k} `)) return n;
  }
  return null;
}
