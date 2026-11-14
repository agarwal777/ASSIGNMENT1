// One status vocabulary everywhere (ledger, thesis strip, cards, portfolio):
//   On track · Behind · Met · Missed · Can't check yet
// "Met" and "Missed" only once the deadline has passed; before that a shortfall is "Behind".
// A revised target shows the latest target's status; the revision lives in the ledger history.
import { Check, CircleCheckBig, CircleHelp, TriangleAlert, X } from "lucide-react";
import type { PromiseStatus, Stance } from "@/lib/types";

export type Status = PromiseStatus;

// Class names are literal so Tailwind can see them (never build them at runtime).
export const STATUS: Record<Status, { label: string; Icon: typeof Check; text: string; bg: string; fill: string; bar: string; stroke: string }> = {
  on_track: { label: "On track", Icon: Check, text: "text-supports", bg: "bg-supports/12", fill: "fill-supports", bar: "bg-supports", stroke: "stroke-supports" },
  met: { label: "Met", Icon: CircleCheckBig, text: "text-supports", bg: "bg-supports/12", fill: "fill-supports", bar: "bg-supports", stroke: "stroke-supports" },
  behind: { label: "Behind", Icon: TriangleAlert, text: "text-unclear", bg: "bg-unclear/12", fill: "fill-unclear", bar: "bg-unclear", stroke: "stroke-unclear" },
  missed: { label: "Missed", Icon: X, text: "text-contradicts", bg: "bg-contradicts/12", fill: "fill-contradicts", bar: "bg-contradicts", stroke: "stroke-contradicts" },
  cant_check: { label: "Can't check yet", Icon: CircleHelp, text: "text-ink-3", bg: "bg-line/60", fill: "fill-ink-3", bar: "bg-ink-3", stroke: "stroke-ink-3" },
};

/** Problems first, then good news, then the unknowable. */
export const STATUS_ORDER: Status[] = ["missed", "behind", "on_track", "met", "cant_check"];
export const isProblem = (s: Status) => s === "behind" || s === "missed";

/** For inputs that only carry a stance (fixtures): the deadline decides Met/Missed vs On track/Behind. */
export function statusFromStance(stance: Stance, deadlinePassed = false): Status {
  if (stance === "supports") return deadlinePassed ? "met" : "on_track";
  if (stance === "contradicts") return deadlinePassed ? "missed" : "behind";
  return "cant_check";
}

/** "2 on track, 1 behind" — for tags and aria-labels. */
export function statusCounts(items: { status: Status }[]): { status: Status; n: number }[] {
  const n = new Map<Status, number>();
  for (const i of items) n.set(i.status, (n.get(i.status) ?? 0) + 1);
  return STATUS_ORDER.filter((s) => n.has(s)).map((s) => ({ status: s, n: n.get(s)! }));
}
