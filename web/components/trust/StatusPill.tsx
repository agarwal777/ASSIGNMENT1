import { STATUS, type Status } from "@/lib/status";

/** Status is never colour alone: icon + word, tinted (FRONTEND.md §4.1, §11). Stance colours live only here. */
export default function StatusPill({ status, size = "sm" }: { status: Status; size?: "sm" | "md" }) {
  const { Icon, label, text, bg } = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 font-medium ${text} ${bg} ${
      size === "md" ? "text-[13px] leading-6" : "text-[11px] leading-5"}`}>
      <Icon size={size === "md" ? 14 : 12} strokeWidth={2.5} aria-hidden />
      {label}
    </span>
  );
}
