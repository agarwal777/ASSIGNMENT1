// Server only. "Explain this filing": a plain-language summary of one exchange filing and what it means for
// an investor who holds the company, written by the model from the filing's own text (the PDF, page by page).
//
// Every point must carry a short verbatim quote and the page it is on. A point is kept only if
//   1. its quote is found on that page (after normalising spaces, case and punctuation), and
//   2. every rupee, percentage and bps figure in it appears on that page, either as written or as the bare
//      number (financial tables state "₹ in crore" once in the header and then print plain numbers).
// Dropped points are counted and shown. The model is told: no price forecasts, no buy/sell advice.
// The investor's thesis is passed as context so "what it means for you" can connect to it; it is the demo
// thesis, not network data, and the network deny-list still applies.
import { createHash } from "node:crypto";
import { apiKey, ENDPOINT } from "@/lib/bullbear";
import { NETWORK_FIELDS, VALIDATOR_VERSION } from "@/lib/numcheck";
import { check, type Page, type Point } from "@/lib/quoteCheck";

export type { Page, Point };

export type Explanation = {
  generatedAt: string; model: string; points: Point[]; impact: Point[]; dropped: number;
  pagesRead: number; pageCount: number;
};

const PROMPT_VERSION = "fx-2";
export const explainKey = (url: string) => createHash("sha256").update(`${PROMPT_VERSION}|${VALIDATOR_VERSION}|${url}`).digest("hex");

const POINT = { type: "object", properties: { text: { type: "string" }, quote: { type: "string" }, page: { type: "integer" } },
  required: ["text", "quote", "page"] };
const SCHEMA = { type: "object", properties: { points: { type: "array", items: POINT }, impact: { type: "array", items: POINT } },
  required: ["points", "impact"] };

export function prompt(ctx: { company: string; title: string; filedOn: string; thesis: string[] }, pages: Page[]): string {
  return [
    `You are briefing a professional investor who owns shares of ${ctx.company}. Below is the text of one stock-exchange filing`,
    `("${ctx.title}", filed ${ctx.filedOn}), page by page.`,
    "",
    "Return two lists:",
    "- `points`: 3 to 5 points saying what this filing actually says, most important first. Plain words, one fact each.",
    "  Skip routine boilerplate (addresses, signatures, regulation numbers, standard disclaimers).",
    "  For financial results, the first point gives the quarter's revenue from operations and profit after tax as printed",
    "  in the results table (say whether standalone or consolidated, and the unit the table states). For a table figure,",
    "  `quote` is that table row as it appears: the row label followed by its numbers.",
    "- `impact`: 1 to 3 points on what this means for someone holding the shares: what changed for the business,",
    "  what to watch or ask management next, and how it bears on the investor's thesis below where it is relevant.",
    "",
    "Rules for every point:",
    "- `quote`: copy 5 to 25 consecutive words exactly as they appear in the filing, and `page`: the page they are on.",
    "- Use only this filing. Write every figure exactly as it appears in the filing, with its unit (for example ₹2,706.57 crore, 4.7%).",
    "  Do not compute new figures.",
    "- No share-price predictions, price targets, valuation, or buy/sell/hold advice.",
    "- If the filing is only a cover letter or notice with nothing material, say so in one point and return an empty `impact`.",
    "",
    "Investor's thesis for this company (context only, do not quote it):",
    ...(ctx.thesis.length ? ctx.thesis.map((t) => `- ${t}`) : ["- (none recorded)"]),
    "",
    "Filing text:",
    ...pages.map((p) => `--- page ${p.page} ---\n${p.text}`),
  ].join("\n");
}

export async function explain(ctx: Parameters<typeof prompt>[0], pages: Page[], pageCount: number):
  Promise<Explanation & { tokensIn: number; tokensOut: number }> {
  const text = prompt(ctx, pages);
  if (NETWORK_FIELDS.test(text)) throw new Error("refused: payload contains investor-network fields");
  const key = apiKey();
  if (!key) throw new Error("no model key configured on the server");
  const models = [process.env.MODEL_SMALL || "gemini-3.6-flash", process.env.MODEL_FALLBACK || "gemini-3.8-flash"];
  let last = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(ENDPOINT(model), {
        method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: SCHEMA } }),
      }).catch((e) => { last = String(e); return null; });
      if (!r) continue;
      if (r.status === 429 || r.status >= 500) { last = `HTTP ${r.status}`; await new Promise((s) => setTimeout(s, 5000 * (attempt + 1))); continue; }
      if (!r.ok) { last = `HTTP ${r.status}`; break; }
      try {
        const data = await r.json();
        const out = JSON.parse(data.candidates[0].content.parts[0].text) as { points: Point[]; impact: Point[] };
        const usage = data.usageMetadata ?? {};
        const keep = (xs: Point[]) => (xs ?? []).map((x) => ({ text: x.text.trim(), quote: x.quote.trim(), page: x.page }))
          .filter((x) => check(x, pages));
        const points = keep(out.points), impact = keep(out.impact);
        return { generatedAt: new Date().toISOString(), model, points, impact,
          dropped: (out.points?.length ?? 0) + (out.impact?.length ?? 0) - points.length - impact.length,
          pagesRead: pages.length, pageCount, tokensIn: usage.promptTokenCount ?? 0, tokensOut: usage.candidatesTokenCount ?? 0 };
      } catch (e) { last = `invalid output: ${e instanceof Error ? e.message : e}`; }
    }
  }
  throw new Error(`model unavailable (${last})`);
}

