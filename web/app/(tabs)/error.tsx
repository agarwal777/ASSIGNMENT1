"use client";

import Link from "next/link";
import { copy } from "@/lib/copy";

// Every tab screen falls back to this instead of rendering blank (FRONTEND.md §10, §13).
export default function TabsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-4 py-10">
      <h1 className="font-serif text-[19px]">{copy.errors.title}</h1>
      <p className="mt-2 text-[15px] text-ink-2">{copy.errors.body}</p>
      <div className="mt-4 flex gap-2">
        <button onClick={reset} className="min-h-11 rounded-[8px] bg-ink px-4 text-[15px] font-medium text-bg">{copy.errors.retry}</button>
        <Link href="/today" className="inline-flex min-h-11 items-center rounded-[8px] border border-line px-4 text-[15px]">{copy.errors.home}</Link>
      </div>
    </div>
  );
}
