"use client";

import { useState, type FormEvent } from "react";
import { Loader, Send } from "lucide-react";
import EpistemicTag from "@/components/trust/EpistemicTag";
import { CitationChip } from "@/components/trust/SourceLink";
import { copy } from "@/lib/copy";
import { date, time } from "@/lib/format";
import { mentionsContact, normalizeQuestion, QUESTION_MAX, QUESTION_MIN } from "@/lib/questionGuard";
import type { SourceRef } from "@/lib/types";

type Sentence = { text: string; citations: SourceRef[] };
type Answer = { question: string; sentences: Sentence[]; dropped: number; generatedAt: string; cached: boolean };
type Reply = ({ type: "answer" } & Answer) | { type: "error"; code: string; message: string };

/**
 * A question about this one company, answered only from its primary sources with a citation on every
 * sentence (the bull-vs-bear checks). Before anything is sent, the browser refuses a question that
 * names someone in the investor's network: the network never leaves the device.
 */
export default function CompanyQuestion({ symbol, name }: { symbol: string; name: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = copy.question;

  const ask = async (q: string) => {
    const question = q.replace(/\s+/g, " ").trim();
    setErr(null);
    if (normalizeQuestion(question).length < QUESTION_MIN) { setErr(t.tooShort); return; }
    setBusy(true);
    try {
      const names = await import("@/lib/vault").then((m) => m.loadNetwork()).then((cs) => cs.map((c) => c.name)).catch(() => [] as string[]);
      const hit = mentionsContact(question, names);
      if (hit) { setErr(t.namesContact(hit)); return; }
      const r = (await fetch("/api/company-question", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, question }) }).then((x) => x.json())) as Reply;
      if (r.type === "answer") setAns(r);
      else setErr(r.code === "cap" ? t.cap : r.code === "busy" ? t.busy : r.code === "not_configured" ? t.notConfigured
        : r.code === "invalid" ? t.tooShort : r.code === "evidence" ? t.noEvidence : t.failed(r.message));
    } catch (e) {
      setErr(t.failed(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (!busy) void ask(text); };

  const nums = new Map<string, number>();
  const n = (s: SourceRef) => { const k = `${s.documentId}#${s.page ?? ""}`; if (!nums.has(k)) nums.set(k, nums.size + 1); return nums.get(k)!; };

  return (
    <div>
      <form onSubmit={submit} className="flex items-center gap-2 rounded-[8px] border border-line bg-surface pl-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t.label(name)}</span>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={QUESTION_MAX} placeholder={t.placeholder}
            className="h-11 w-full bg-transparent text-[15px] outline-none" autoComplete="off" enterKeyHint="send" />
        </label>
        <button type="submit" disabled={busy} aria-label={t.send}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-accent disabled:text-ink-3">
          {busy ? <Loader size={18} aria-hidden className="animate-spin" /> : <Send size={18} aria-hidden />}
        </button>
      </form>
      {!ans && !busy && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {t.suggestions.map((s) => (
            <li key={s}><button type="button" onClick={() => { setText(s); void ask(s); }}
              className="min-h-11 rounded-full border border-line px-3 text-left text-[13px] text-ink-2">{s}</button></li>
          ))}
        </ul>
      )}
      {busy && <p className="mt-2 text-[13px] text-ink-3" aria-live="polite">{t.reading}</p>}
      {err && !busy && <p role="alert" className="mt-2 text-[13px] text-contradicts">{err}</p>}
      {ans && !busy && (
        <section aria-live="polite" className="mt-3 rounded-[12px] border border-line bg-surface p-3">
          <h3 className="flex items-start justify-between gap-2 text-[13px] font-medium text-ink-2">
            <span className="min-w-0">{ans.question}</span> <EpistemicTag e="INFERRED" />
          </h3>
          {ans.sentences.length > 0 ? (
            <p className="mt-1 text-[15px] leading-[22px]">
              {ans.sentences.map((s, i) => (
                <span key={i}>{s.text}{s.citations.map((c) => <CitationChip key={c.documentId + (c.page ?? "")} n={n(c)} s={c} />)} </span>
              ))}
            </p>
          ) : <p className="mt-1 text-[15px] leading-[22px] text-ink-2">{t.notInSources(name)}</p>}
          <p className="mt-2 flex flex-wrap gap-x-2 text-[12px] text-ink-3">
            <span>{ans.cached ? t.answeredEarlier(`${date(ans.generatedAt)}, ${time(ans.generatedAt)}`) : t.answered}</span>
            {ans.dropped > 0 && <><span aria-hidden>·</span><span>{copy.bullBear.dropped(ans.dropped)}</span></>}
          </p>
        </section>
      )}
      <p className="mt-2 text-[12px] leading-4 text-ink-3">{t.note}</p>
    </div>
  );
}
