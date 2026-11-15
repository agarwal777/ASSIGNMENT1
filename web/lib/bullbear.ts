// Server only. Bull vs bear from primary sources: the exchange XBRL results and management's own
// words in NSE-filed earnings-call transcripts (both public). Every sentence must cite numbered
// evidence; sentences without a valid citation are dropped. No investor-network data is ever sent.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getCompany } from "@/lib/companies";
import { formatValue, period } from "@/lib/format";
import { STATUS } from "@/lib/status";
import type { SourceRef } from "@/lib/types";

export type Evidence = { n: number; text: string; source: SourceRef };
export type Sentence = { text: string; citations: SourceRef[] };

const ENDPOINT = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
// Same deny-list as workers/llm.py: if any private-vault field name appears, nothing is sent.
const NETWORK_FIELDS = /\b(contact_id|display_name|closeness|last_contacted|contact_stints|org_canonical|network_overlaps)\b/;

/** Numbered evidence for one company: last 4 reported quarters, then management's checkable words. */
export function evidenceFor(symbol: string): { name: string; items: Evidence[] } | null {
  const c = getCompany(symbol);
  if (!c) return null;
  const items: Evidence[] = [];
  const add = (text: string, source?: SourceRef) => { if (source?.documentId) items.push({ n: items.length + 1, text, source }); };
  for (const q of c.quarters.slice(-4)) {
    const parts = [
      q.revenue && `revenue ${formatValue("inr_cr", q.revenue.value)}${q.revenueYoy ? ` (${formatValue("pct", q.revenueYoy.value)} YoY)` : ""}`,
      q.ebitdaMargin && `EBITDA margin ${formatValue("pct", q.ebitdaMargin.value, false)}`,
      q.pat && `profit after tax ${formatValue("inr_cr", q.pat.value)}`,
    ].filter(Boolean);
    if (parts.length) add(`${period(q.period)} results filed on the exchange: ${parts.join(", ")}.`, q.revenue?.source ?? q.pat?.source);
  }
  for (const p of c.ledger.slice(0, 12)) {
    const quote = p.quote.text.length > 420 ? `${p.quote.text.slice(0, 417)}…` : p.quote.text;
    add(`${p.quote.speaker} on the ${p.saidAt} earnings call: "${quote}" Checked against reported numbers: ${STATUS[p.status].label}${
      p.status === "cant_check" ? "" : ` (${p.evidence})`}.`, p.quote);
  }
  return { name: c.name, items };
}

const SCHEMA = {
  type: "object",
  properties: { sentences: { type: "array", items: { type: "object",
    properties: { text: { type: "string" }, cites: { type: "array", items: { type: "integer" } } }, required: ["text", "cites"] } } },
  required: ["sentences"],
};

function prompt(side: "bear" | "bull", name: string, items: Evidence[]): string {
  return [
    `Write the ${side.toUpperCase()} case for ${name} for a professional investor.`,
    "Use ONLY the numbered evidence below. No outside knowledge, no share price, valuation or forecasts that the evidence does not contain.",
    `Write 3 or 4 short sentences, one point each. ${side === "bear" ? "Focus on risks, shortfalls and what could go wrong." : "Focus on strengths, delivery and what could go right."}`,
    "For every sentence, list in `cites` the evidence numbers it relies on. Do not write citation numbers in the text.",
    "If the evidence does not support a point, leave it out. Fewer sentences are better than unsupported ones.",
    "", "Evidence:", ...items.map((e) => `[${e.n}] ${e.text}`),
  ].join("\n");
}

function apiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // Local runs: the workers' key file one level up (never committed, never sent to the browser).
  const f = path.join(process.cwd(), "..", ".env.local");
  if (!existsSync(f)) return undefined;
  const line = readFileSync(f, "utf-8").split(/\r?\n/).find((l) => l.startsWith("GEMINI_API_KEY="));
  return line?.slice("GEMINI_API_KEY=".length).trim().replace(/^["']|["']$/g, "") || undefined;
}

/** One side, validated: every kept sentence cites at least one real evidence item. */
export async function side(which: "bear" | "bull", name: string, items: Evidence[]): Promise<Sentence[]> {
  const text = prompt(which, name, items);
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
      if (r.status === 429 || r.status >= 500) { last = `HTTP ${r.status}`; await new Promise((s) => setTimeout(s, 6000 * (attempt + 1))); continue; }
      if (!r.ok) { last = `HTTP ${r.status}`; break; }
      try {
        const data = await r.json();
        const out = JSON.parse(data.candidates[0].content.parts[0].text) as { sentences: { text: string; cites: number[] }[] };
        return out.sentences.flatMap((s) => {
          const cites = [...new Set(s.cites)].filter((n) => items.some((e) => e.n === n));
          const t = s.text.replace(/\s*\[\d+(?:,\s*\d+)*\]/g, "").trim();
          // Two quotes from the same transcript page are one citation.
          const sources = cites.map((n) => items.find((e) => e.n === n)!.source)
            .filter((x, i, all) => all.findIndex((y) => y.documentId === x.documentId && y.page === x.page) === i);
          return cites.length && t ? [{ text: t, citations: sources }] : [];
        });
      } catch (e) { last = `invalid output: ${e instanceof Error ? e.message : e}`; }
    }
  }
  throw new Error(`model unavailable (${last})`);
}
