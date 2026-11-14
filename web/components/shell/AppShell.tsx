import { Suspense } from "react";
import BottomNav from "@/components/shell/BottomNav";
import SheetHost from "@/components/trust/SheetHost";

/** Single column, 390 px design width, centred at max 480 px; leaves room for the bottom nav. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <div className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
      {/* Reads search params, so it sits in its own boundary and the page still prerenders. */}
      <Suspense fallback={null}><SheetHost /></Suspense>
    </div>
  );
}
