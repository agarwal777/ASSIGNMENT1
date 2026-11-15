// Checks for model-written text, kept free of "@/" imports so `node --test` can load it directly.
//
// 1. NETWORK_FIELDS: the same deny-list as workers/llm.py (a test keeps the two identical). If any
//    private-vault field name appears in a prompt, nothing is sent to the model.
// 2. Number check: every rupee amount, percentage and basis-point figure in a sentence must appear in
//    that sentence's cited evidence, after rounding the evidence to the decimals the sentence shows.
//    Four-digit years and quarter/fiscal labels (Q2, FY27) are not figures. Signs are ignored ("fell
//    3.4%" matches "−3.4%"); the word carries the direction. A figure the model computed from two
//    items (a difference, a bps change) is not in the evidence, so its sentence is dropped.

export const NETWORK_FIELDS =
  /\b(contact_id|display_name|closeness|last_contacted|contact_stints|org_canonical|network_overlaps)\b/;
export const VALIDATOR_VERSION = "numcheck-1";

export type Figure = { kind: "inr_cr" | "inr" | "usd_mn" | "pct" | "bps"; value: number; decimals: number };

const num = (s: string) => Number(s.replace(/,/g, ""));
const dec = (s: string) => (s.includes(".") ? s.split(".")[1].length : 0);
// Crore multipliers for Indian and international units.
const CRORE: Record<string, number> = { "lakh crore": 1e5, "lakh cr": 1e5, crore: 1, cr: 1, crores: 1, lakh: 0.01,
  billion: 100, bn: 100, million: 0.1, mn: 0.1 };

/** Every rupee, USD, percentage and bps figure in a piece of text. */
export function figuresIn(raw: string): Figure[] {
  const t = raw.replace(/−/g, "-").replace(/–|—/g, "-");
  const out: Figure[] = [];
  const used: [number, number][] = [];
  const take = (re: RegExp, f: (m: RegExpExecArray) => Figure[]) => {
    for (const m of t.matchAll(re)) {
      const at = m.index ?? 0;
      if (used.some(([a, b]) => at < b && at + m[0].length > a)) continue;
      used.push([at, at + m[0].length]);
      out.push(...f(m as RegExpExecArray));
    }
  };
  // Ranges first, so "20-21%" yields 20% and 21%.
  take(/(\d+(?:\.\d+)?)\s?(?:-|to)\s?(\d+(?:\.\d+)?)\s?%/gi, (m) => [
    { kind: "pct", value: num(m[1]), decimals: dec(m[1]) }, { kind: "pct", value: num(m[2]), decimals: dec(m[2]) }]);
  take(/(?:US\$|USD|\$)\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|bn|million|mn)?/gi, (m) => {
    const u = (m[2] ?? "million").toLowerCase();
    return [{ kind: "usd_mn", value: num(m[1]) * (u.startsWith("b") ? 1000 : 1), decimals: dec(m[1]) }];
  });
  take(/(?:₹|Rs\.?|INR)?\s?(\d[\d,]*(?:\.\d+)?)\s*(lakh crore|lakh cr|crores?|cr\b|lakh|billion|bn\b|million|mn\b)/gi, (m) => {
    const u = m[2].toLowerCase().replace(/crores$/, "crore");
    return [{ kind: "inr_cr", value: num(m[1]) * (CRORE[u] ?? 1), decimals: dec(m[1]) + (CRORE[u] && CRORE[u] < 1 ? 2 : 0) }];
  });
  take(/(?:₹|Rs\.?)\s?(\d[\d,]*(?:\.\d+)?)/gi, (m) => [{ kind: "inr", value: num(m[1]), decimals: dec(m[1]) }]);
  take(/(\d[\d,]*(?:\.\d+)?)\s?(?:bps|basis points?)/gi, (m) => [{ kind: "bps", value: num(m[1]), decimals: dec(m[1]) }]);
  take(/(\d+(?:\.\d+)?)\s?(?:%|per ?cent)/gi, (m) => [{ kind: "pct", value: num(m[1]), decimals: dec(m[1]) }]);
  return out;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** A sentence passes when each of its figures matches a figure of the same kind in its cited evidence. */
export function unsupported(sentence: string, evidence: string[]): Figure[] {
  const have = evidence.flatMap(figuresIn);
  return figuresIn(sentence).filter((f) => !have.some((e) =>
    e.kind === f.kind && round(Math.abs(e.value), f.decimals) === round(Math.abs(f.value), f.decimals)));
}
