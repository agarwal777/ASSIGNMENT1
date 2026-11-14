import { Suspense } from "react";
import AskView from "@/components/ask/AskView";
import TopBar from "@/components/shell/TopBar";
import { SNAPSHOT_AS_OF, companySymbols } from "@/lib/companies";
import { copy } from "@/lib/copy";

// Server shell: passes which symbols already have a prerendered Company page. The view reads
// ?q / ?intent, so it sits in a Suspense boundary (Next 16 Cache Components).
export default function AskPage() {
  return (
    <>
      <TopBar title={copy.ask.title} />
      <Suspense fallback={<div aria-busy="true" className="mx-4 mt-3 h-11 w-48 rounded-full bg-line" />}>
        <AskView known={companySymbols()} asOf={SNAPSHOT_AS_OF} />
      </Suspense>
    </>
  );
}
