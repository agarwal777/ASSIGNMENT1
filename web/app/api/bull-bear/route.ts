import { evidenceFor, side } from "@/lib/bullbear";

// Two model calls (bear, then bull); the free tier is often overloaded, so each retries with backoff.
export const maxDuration = 300;

/**
 * POST { symbol } → NDJSON: { type: "section", side, text, citations } per sentence, Bear first,
 * then Bull, then { type: "done" }; { type: "error", message } on failure. Nothing is cached here:
 * the page keeps the last result per company and offers Refresh.
 */
export async function POST(request: Request) {
  const { symbol } = (await request.json().catch(() => ({}))) as { symbol?: string };
  const ev = symbol ? evidenceFor(symbol) : null;
  const enc = new TextEncoder();
  const line = (o: unknown) => enc.encode(`${JSON.stringify(o)}\n`);
  const body = new ReadableStream({
    async start(ctl) {
      try {
        if (!ev) throw new Error("company not in the snapshot");
        if (ev.items.length < 2) throw new Error("not enough primary-source evidence for this company yet");
        for (const which of ["bear", "bull"] as const) {
          const sentences = await side(which, ev.name, ev.items);
          for (const s of sentences) ctl.enqueue(line({ type: "section", side: which, text: s.text, citations: s.citations }));
          ctl.enqueue(line({ type: "side_done", side: which, kept: sentences.length }));
        }
        ctl.enqueue(line({ type: "done", mode: "full", evidence: ev.items.length }));
      } catch (e) {
        ctl.enqueue(line({ type: "error", message: e instanceof Error ? e.message : String(e) }));
      } finally {
        ctl.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
