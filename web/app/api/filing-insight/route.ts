import companiesData from "@/data/companies.json";
import digestData from "@/data/digest.json";
import prices from "@/data/prices.json";
import { getEvent } from "@/lib/api";
import { explain, explainKey, type Explanation, type Page } from "@/lib/filingExplain";
import { filedAtFromXbrl, pastReactions, reactionTo, type Close, type Reaction } from "@/lib/reaction";
import { serviceClient } from "@/lib/supabaseServer";

// Reading a long PDF and one model call (with retries on the free tier).
export const maxDuration = 120;

// New explanations share the bull vs bear daily cap and cache (db/migrations/0003): one validated result
// per filing (keyed "filing:<id>" + a hash of the prompt version and the PDF's URL) serves every visitor.
const DAILY_CAP = Number(process.env.BULL_BEAR_DAILY_CAP ?? 40);

type Raw = { quarters?: { source?: string }[]; thesis?: { investor?: { text: string; evidence?: string }[] } };
const COMPANIES = (companiesData as unknown as { companies: Record<string, Raw> }).companies;
const EVENTS = (digestData as unknown as { events: { symbol: string; category: string; at: string; kind: string }[] }).events;

/** How the price moved after this filing, and after this company's earlier filings of the same type. */
function reactions(id: string): { now: Reaction; past: Reaction[]; pastKind: "results" | "same_type" } | null {
  const ev = getEvent(id);
  const closes = (prices as unknown as Record<string, Close[]>)[ev?.symbol ?? ""];
  if (!ev || !closes?.length) return null;
  // Results: the company's XBRL filings carry their filing time, so a year of earlier results is known.
  // Other types: only the earlier filings in FINN's own window.
  const pastAts = ev.category === "results"
    ? (COMPANIES[ev.symbol]?.quarters ?? []).map((q) => (q.source ? filedAtFromXbrl(q.source) : null)).filter((x): x is string => !!x)
    : EVENTS.filter((e) => e.kind === "filing" && e.symbol === ev.symbol && e.category === ev.category).map((e) => e.at);
  return { now: reactionTo(ev.at, closes), past: pastReactions(pastAts, closes, ev.at).slice(0, 8),
    pastKind: ev.category === "results" ? "results" : "same_type" };
}

async function pdfPages(url: string, origin: string): Promise<{ pages: Page[]; page_count: number }> {
  const secret = process.env.CRON_SECRET;
  const r = await fetch(`${origin}/api/py/filing-text?url=${encodeURIComponent(url)}`,
    { headers: secret ? { authorization: `Bearer ${secret}` } : {}, signal: AbortSignal.timeout(45_000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `filing text: HTTP ${r.status}`);
  return body;
}

/**
 * POST { id, mode } → JSON.
 *   mode "reaction": price moves only (no model, instant).
 *   mode "peek":     a cached explanation if one exists, else { none: true }.
 *   mode "explain":  the cached explanation, or generate one (claim, PDF, model, checks, store).
 * Errors: { error: { code, message } } with code evidence | not_configured | cap | busy | pdf | model.
 */
export async function POST(request: Request) {
  const { id, mode = "reaction" } = (await request.json().catch(() => ({}))) as { id?: string; mode?: string };
  const ev = id ? getEvent(id) : undefined;
  const fail = (code: string, message: string, status = 200) => Response.json({ error: { code, message } }, { status });
  if (!ev || ev.kind !== "filing") return fail("evidence", "not a filing in FINN's data", 404);
  if (mode === "reaction") return Response.json({ reaction: reactions(ev.id) });
  if (!ev.url || !/\.pdf($|\?)/i.test(ev.url)) return fail("pdf", "this filing has no PDF to read");

  const sb = serviceClient();
  const key = { symbol: `filing:${ev.id}`, sha: explainKey(ev.url) };
  const read = async () => sb ? ((await sb.from("bull_bear_cache").select("status, payload")
    .eq("symbol", key.symbol).eq("evidence_sha", key.sha).maybeSingle()).data as { payload: Explanation | null } | null) : null;

  if (mode === "peek") {
    const row = await read();
    return Response.json(row?.payload ? { explanation: row.payload, cached: true } : { none: true });
  }
  if (!sb && process.env.NODE_ENV === "production") return fail("not_configured", "explanations are not configured on this server");

  if (sb) {
    const { data: claim, error } = await sb.rpc("bull_bear_claim", { p_symbol: key.symbol, p_sha: key.sha, p_cap: DAILY_CAP, p_refresh: false });
    if (error) return fail("not_configured", "explanation storage is not set up yet");
    if (claim === "cached") { const row = await read(); if (row?.payload) return Response.json({ url: ev.url, explanation: row.payload, cached: true }); }
    if (claim === "busy") return fail("busy", "someone else is generating this right now; try again in a minute");
    if (claim === "cap") return fail("cap", "today's limit for new explanations is reached");
  }
  const release = async () => { if (sb) await sb.from("bull_bear_cache").delete().eq("symbol", key.symbol).eq("evidence_sha", key.sha); };

  let pdf: { pages: Page[]; page_count: number };
  try {
    pdf = await pdfPages(ev.url, new URL(request.url).origin);
  } catch (e) {
    await release();
    return fail("pdf", e instanceof Error ? e.message : String(e));
  }
  const pages = pdf.pages.filter((p) => p.text.trim().length > 0);
  if (!pages.length) { await release(); return fail("pdf", "this PDF is a scanned image with no text to read; open it instead"); }

  const thesis = (COMPANIES[ev.symbol]?.thesis?.investor ?? []).map((t) => (t.evidence ? `${t.text} (so far: ${t.evidence})` : t.text));
  const filedOn = new Date(ev.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  try {
    const r = await explain({ company: ev.name, title: ev.title, filedOn, thesis }, pages, pdf.page_count);
    const { tokensIn, tokensOut, ...payload } = r;
    // Nothing survived the checks: show that, but don't keep it, so a later try can do better.
    if (!payload.points.length) { await release(); return Response.json({ url: ev.url, explanation: payload, cached: false }); }
    if (sb) {
      await sb.from("llm_calls").insert({ model: r.model, task: `filing_explain:${ev.id}`, tokens_in: tokensIn, tokens_out: tokensOut, cost_inr: 0, cache_hit: false });
      await sb.from("bull_bear_cache").update({ status: "ready", payload, updated_at: new Date().toISOString() })
        .eq("symbol", key.symbol).eq("evidence_sha", key.sha);
    }
    return Response.json({ url: ev.url, explanation: payload, cached: false });
  } catch (e) {
    await release();
    return fail("model", e instanceof Error ? e.message : String(e));
  }
}
