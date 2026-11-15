import { evidenceFor, evidenceHash, side, type Sentence, type SideResult } from "@/lib/bullbear";
import { serviceClient } from "@/lib/supabaseServer";

// Two model calls (bear, then bull); the free tier is often overloaded, so each retries with backoff.
export const maxDuration = 300;

// New generations per day across all visitors (cache hits are free). Each generation is up to 12
// upstream requests (2 sides × 2 models × 3 attempts), so 40 bounds a day at ~480 requests.
const DAILY_CAP = Number(process.env.BULL_BEAR_DAILY_CAP ?? 40);
const REFRESH_AFTER_MS = 24 * 3600_000;

type Payload = { generatedAt: string; model: string; bear: Sentence[]; bull: Sentence[]; dropped: { bear: number; bull: number } };

/**
 * POST { symbol, peek?, refresh? } → NDJSON. One validated result per (company, evidence hash) lives in
 * Supabase (db/migrations/0003) and is served to every visitor. `peek` only returns a cached result.
 * A cold request claims the work (single flight, global daily cap) and streams Bear, then Bull, as each
 * side finishes; only complete, validated results are stored. Events:
 *   section {side,text,citations} · side_done {side,kept,dropped} · done {generatedAt,cached,refreshable}
 *   none (peek miss) · error {code,message} with code: not_configured | cap | busy | model | evidence
 */
export async function POST(request: Request) {
  const { symbol, peek = false, refresh = false } = (await request.json().catch(() => ({}))) as
    { symbol?: string; peek?: boolean; refresh?: boolean };
  const ev = symbol ? evidenceFor(symbol) : null;
  const sb = serviceClient();
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctl) {
      // A visitor who presses Stop detaches; the server keeps going so the work is cached, not wasted.
      const send = (o: unknown) => { try { ctl.enqueue(enc.encode(`${JSON.stringify(o)}\n`)); } catch { /* client gone */ } };
      const replay = (p: Payload, cached: boolean) => {
        for (const which of ["bear", "bull"] as const) {
          for (const s of p[which]) send({ type: "section", side: which, text: s.text, citations: s.citations });
          send({ type: "side_done", side: which, kept: p[which].length, dropped: p.dropped[which] });
        }
        send({ type: "done", generatedAt: p.generatedAt, cached,
          refreshable: Date.now() - new Date(p.generatedAt).getTime() > REFRESH_AFTER_MS });
      };
      try {
        if (!ev || !symbol) return send({ type: "error", code: "evidence", message: "company not in the snapshot" });
        if (ev.items.length < 2) return send({ type: "error", code: "evidence", message: "not enough primary-source evidence for this company yet" });
        if (!sb) {
          if (process.env.NODE_ENV === "production")
            return send({ type: "error", code: "not_configured", message: "bull vs bear is not configured on this server yet" });
          // Local development without the service key: generate uncached.
          if (peek) return send({ type: "none" });
          const p = await generate(ev, send);
          return send({ type: "done", generatedAt: p.generatedAt, cached: false, refreshable: false });
        }
        const sha = evidenceHash(ev.items);
        const read = async () => (await sb.from("bull_bear_cache").select("status, payload")
          .eq("symbol", symbol).eq("evidence_sha", sha).maybeSingle()).data as { status: string; payload: Payload | null } | null;

        if (peek) {
          const row = await read();
          return row?.payload ? replay(row.payload, true) : send({ type: "none" });
        }
        const { data: claim, error } = await sb.rpc("bull_bear_claim",
          { p_symbol: symbol, p_sha: sha, p_cap: DAILY_CAP, p_refresh: refresh });
        if (error) return send({ type: "error", code: "not_configured", message: "bull vs bear storage is not set up yet" });
        if (claim === "cached") { const row = await read(); if (row?.payload) return replay(row.payload, true); }
        if (claim === "busy") return send({ type: "error", code: "busy", message: "another visitor is generating this right now" });
        if (claim === "cap") return send({ type: "error", code: "cap", message: "today's limit for new bull vs bear write-ups is reached" });

        const previous = (await read())?.payload ?? null;
        try {
          const p = await generate(ev, send, async (r, which) => {
            await sb.from("llm_calls").insert({ model: r.model, task: `bull_bear:${which}:${symbol}`,
              tokens_in: r.tokensIn, tokens_out: r.tokensOut, cost_inr: 0, cache_hit: false });
          });
          await sb.from("bull_bear_cache").update({ status: "ready", payload: p, updated_at: new Date().toISOString() })
            .eq("symbol", symbol).eq("evidence_sha", sha);
          send({ type: "done", generatedAt: p.generatedAt, cached: false, refreshable: false });
        } catch (e) {
          // Nothing partial is stored: put back the previous copy, or release the claim.
          if (previous) await sb.from("bull_bear_cache").update({ status: "ready", payload: previous }).eq("symbol", symbol).eq("evidence_sha", sha);
          else await sb.from("bull_bear_cache").delete().eq("symbol", symbol).eq("evidence_sha", sha);
          throw e;
        }
      } catch (e) {
        send({ type: "error", code: "model", message: e instanceof Error ? e.message : String(e) });
      } finally {
        try { ctl.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Bear, then Bull, streaming each side's kept sentences as soon as it is validated. */
async function generate(ev: NonNullable<ReturnType<typeof evidenceFor>>, send: (o: unknown) => void,
  log?: (r: SideResult, which: "bear" | "bull") => Promise<void>): Promise<Payload> {
  const out: Payload = { generatedAt: "", model: "", bear: [], bull: [], dropped: { bear: 0, bull: 0 } };
  for (const which of ["bear", "bull"] as const) {
    const r = await side(which, ev.name, ev.items);
    await log?.(r, which);
    out[which] = r.sentences;
    out.dropped[which] = r.dropped;
    out.model = r.model;
    for (const s of r.sentences) send({ type: "section", side: which, text: s.text, citations: s.citations });
    send({ type: "side_done", side: which, kept: r.sentences.length, dropped: r.dropped });
  }
  out.generatedAt = new Date().toISOString();
  return out;
}
