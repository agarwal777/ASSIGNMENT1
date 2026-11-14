import Link from "next/link";
import { copy } from "@/lib/copy";

// Root fallback for unknown URLs and notFound() calls. Under the tabs it renders inside their shell
// (with navigation); elsewhere it stands alone with a way back. Never a blank screen.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[480px] px-4 py-10">
      <h1 className="font-serif text-[19px]">{copy.errors.notFoundTitle}</h1>
      <p className="mt-2 text-[15px] text-ink-2">{copy.errors.notFoundBody}</p>
      <Link href="/ask" className="mt-4 inline-flex min-h-11 items-center rounded-[8px] border border-line px-4 text-[15px]">{copy.errors.toAsk}</Link>
    </div>
  );
}
