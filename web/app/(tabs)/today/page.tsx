import { Suspense } from "react";
import TopBar from "@/components/shell/TopBar";
import TodayView from "@/components/today/TodayView";
import { copy } from "@/lib/copy";

// The brief reads ?date and ?window, so the view sits in a Suspense boundary (Next 16 Cache
// Components); the fallback mirrors the final layout so nothing jumps when it arrives.
export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayView />
    </Suspense>
  );
}

function TodaySkeleton() {
  return (
    <div aria-busy="true" aria-label={copy.today.loading}>
      <TopBar title={copy.today.title} />
      <div className="h-11 border-b border-line bg-accent/10" />
      <div className="space-y-3 px-4 pt-4">
        <div className="h-5 w-3/4 rounded bg-line" />
        <div className="h-11 w-40 rounded-full bg-line" />
        {[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-[12px] border border-line bg-surface" />)}
      </div>
    </div>
  );
}
