"use client";

import { useCallback, useRef, useState } from "react";

/**
 * POST a JSON body and read the response as NDJSON (one JSON object per line), calling `onEvent`
 * as each line arrives (FRONTEND.md §8). Works whether or not the host actually streams: a
 * buffered response simply delivers every line at the end.
 */
export function useNdjsonStream<E>() {
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (url: string, body: unknown, onEvent: (e: E) => void, onFail: (msg: string) => void) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    try {
      const r = await fetch(url, { method: "POST", body: JSON.stringify(body), signal: ac.signal,
        headers: { "Content-Type": "application/json" } });
      if (!r.ok && r.status !== 400) throw new Error(`HTTP ${r.status}`);
      if (!r.body) throw new Error("no body");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) onEvent(JSON.parse(line) as E);
        }
      }
      if (buf.trim()) onEvent(JSON.parse(buf) as E);
    } catch (e) {
      if (!ac.signal.aborted) onFail(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ac) setRunning(false);
    }
  }, []);

  const stop = useCallback(() => { abortRef.current?.abort(); setRunning(false); }, []);
  return { start, stop, running };
}
