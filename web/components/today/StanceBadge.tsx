import { Check, CircleHelp, Minus, X } from "lucide-react";
import { copy } from "@/lib/copy";
import type { Stance } from "@/lib/types";

const STYLE: Record<Stance, { Icon: typeof Check; cls: string }> = {
  supports: { Icon: Check, cls: "text-supports border-supports/40" },
  contradicts: { Icon: X, cls: "text-contradicts border-contradicts/40" },
  neutral: { Icon: Minus, cls: "text-unclear border-unclear/40" },
  insufficient: { Icon: CircleHelp, cls: "text-unclear border-unclear/40" },
};

/** Stance is never colour alone: icon + word + colour (FRONTEND.md §4.1, §11). */
export default function StanceBadge({ stance, size = "sm" }: { stance: Stance; size?: "sm" | "md" }) {
  const { Icon, cls } = STYLE[stance];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 font-medium ${cls} ${
      size === "md" ? "text-[13px] leading-6" : "text-[11px] leading-5"}`}>
      <Icon size={size === "md" ? 14 : 12} strokeWidth={2.5} aria-hidden />
      {copy.stance[stance]}
    </span>
  );
}
