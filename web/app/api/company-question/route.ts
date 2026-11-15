import type { Sentence } from "@/lib/bullbear";
import { answer, questionEvidence, questionKey } from "@/lib/companyQuestion";
import { normalizeQuestion, QUESTION_MAX, QUESTION_MIN } from "@/lib/questionGuard";
import { serviceClient } from "@/lib/supabaseServer";

export const maxDuration = 120;

// Shared with bull vs bear: one daily budget of new model generations across all visitors.
const DAILY_CAP = Number(process.env.BULL_BEAR_DAILY_CAP ?? 40);

type Payload = { kind: "question"; question: string; generatedAt: string; model: string; sentences: Sentence[]; dropped: number };
type Out = { type: "answer"; question: string; sentences: Sentence[]; dropped: number; generatedAt: string; cached: boolean }
  | { type: "error"; code: "invalid" | "evidence" | "not_configured" | "cap" | "busy" | "model"; message: string };

const reply = (o: Out) => Response.json(o, { headers: { "Cache-Control": "no-store" } });

/**
 * POST { symbol, question } → one validated answer from that company's primary sources. Answers are
 * stored per (company, normalised question, evidence) in the bull-vs-bear cache table and served to
 * every visitor who asks the same thing; a new one is claimed single-flight under the shared daily cap.
 */
export async function POST(request: Request) {
  const { symbol, question } = (await request.json().catch(() => ({}))) as { symbol?: string; question?: string };
  const q = (question ?? "").replace(/\s+/g, " ").trim();
  if (normalizeQuestion(q).length < QUESTION_MIN || q.length > QUESTION_MAX)
    return reply({ type: "error", code: "invalid", message: `a question of ${QUESTION_MIN}–${QUESTION_MAX} characters` });
  const ev = symbol ? questionEvidence(symbol) : null;
  if (!ev || !symbol || ev.items.length < 2) return reply({ type: "error", code: "evidence", message: "not enough primary-source evidence for this company yet" });

  const sb = serviceClient();
  try {
    if (!sb) {
      if (process.env.NODE_ENV === "production")
        return reply({ type: "error", code: "not_configured", message: "model answers are not configured on this server yet" });
      const r = await answer(q, ev.name, ev.items);   // local development without the service key: uncached
      return reply({ type: "answer", question: q, sentences: r.sentences, dropped: r.dropped, generatedAt: new Date().toISOString(), cached: false });
    }
    const sha = questionKey(q, ev.items);
    const read = async () => (await sb.from("bull_bear_cache").select("payload")
      .eq("symbol", symbol).eq("evidence_sha", sha).maybeSingle()).data?.payload as Payload | null | undefined;
    const { data: claim, error } = await sb.rpc("bull_bear_claim", { p_symbol: symbol, p_sha: sha, p_cap: DAILY_CAP, p_refresh: false });
    if (error) return reply({ type: "error", code: "not_configured", message: "answer storage is not set up yet" });
    if (claim === "cached") {
      const p = await read();
      if (p) return reply({ type: "answer", question: p.question, sentences: p.sentences, dropped: p.dropped, generatedAt: p.generatedAt, cached: true });
    }
    if (claim === "busy") return reply({ type: "error", code: "busy", message: "another visitor is asking this right now" });
    if (claim === "cap") return reply({ type: "error", code: "cap", message: "today's limit for new model answers is reached" });

    try {
      const r = await answer(q, ev.name, ev.items);
      await sb.from("llm_calls").insert({ model: r.model, task: `company_question:${symbol}`,
        tokens_in: r.tokensIn, tokens_out: r.tokensOut, cost_inr: 0, cache_hit: false });
      const p: Payload = { kind: "question", question: q, generatedAt: new Date().toISOString(), model: r.model, sentences: r.sentences, dropped: r.dropped };
      await sb.from("bull_bear_cache").update({ status: "ready", payload: p, updated_at: p.generatedAt }).eq("symbol", symbol).eq("evidence_sha", sha);
      return reply({ type: "answer", question: q, sentences: p.sentences, dropped: p.dropped, generatedAt: p.generatedAt, cached: false });
    } catch (e) {
      await sb.from("bull_bear_cache").delete().eq("symbol", symbol).eq("evidence_sha", sha);   // release the claim
      throw e;
    }
  } catch (e) {
    return reply({ type: "error", code: "model", message: e instanceof Error ? e.message : String(e) });
  }
}
