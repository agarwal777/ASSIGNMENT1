import BottomNav from "@/components/shell/BottomNav";

/** Single column, 390 px design width, centred at max 480 px; leaves room for the bottom nav. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <div className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
    </div>
  );
}
