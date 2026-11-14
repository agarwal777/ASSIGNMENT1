"use client";

import { useEffect, useState } from "react";
import { ensureDemoSession, supabase } from "@/lib/supabase";

type Status = { user?: string; contacts?: number; py?: string; error?: string };

// B0 smoke screen: proves no-login sign-in, RLS-scoped reads and the Python service.
// Replaced by the Today screen in B3.
export default function Home() {
  const [s, setS] = useState<Status>({});

  useEffect(() => {
    (async () => {
      try {
        const user = await ensureDemoSession();
        const { count } = await supabase
          .from("contacts")
          .select("id", { count: "exact", head: true });
        const py = await fetch("/api/py/health").then((r) => r.json()).catch(() => null);
        setS({ user: user.slice(0, 8), contacts: count ?? 0, py: py?.status ?? "unreachable" });
      } catch (e) {
        setS({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-md p-4 font-sans">
      <h1 className="text-2xl font-semibold">FINN</h1>
      {s.error ? (
        <p className="mt-4 text-red-600">Setup error: {s.error}</p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          <li>Demo user: {s.user ?? "…"}</li>
          <li>Your contacts visible: {s.contacts ?? "…"}</li>
          <li>Python service: {s.py ?? "…"}</li>
        </ul>
      )}
    </main>
  );
}
