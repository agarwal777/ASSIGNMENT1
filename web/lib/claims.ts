// Raw snapshot claim fields → the Claim contract, and the one caption every bullet chart uses:
// "13.8% year to date vs 15% target · 2 quarters left".
import { pct } from "@/lib/format";
import type { Claim, PromiseStatus } from "@/lib/types";

export type RawClaimFields = {
  metric: string; deadline?: string; deadline_period?: string; status: string;
  target_low?: number | null; target_high?: number | null; actual?: number | null;
  quarters_reported?: number | null; quarters_total?: number | null;
};

const CHARTABLE = new Set(["ebitda_margin", "revenue_growth", "pat_growth"]);

export function toClaim(r: RawClaimFields): Claim | undefined {
  if (!CHARTABLE.has(r.metric) || r.target_low == null) return undefined;
  return {
    metric: r.metric, unit: r.metric === "ebitda_margin" ? "pct" : "pct_yoy",
    deadline: r.deadline ?? r.deadline_period ?? "", status: r.status as PromiseStatus,
    target: r.target_low, targetHigh: r.target_high != null && r.target_high !== r.target_low ? r.target_high : undefined,
    actual: r.actual ?? undefined, quartersReported: r.quarters_reported ?? undefined, quartersTotal: r.quarters_total ?? undefined,
  };
}

const v = (c: Claim, x: number) => `${pct(x, c.unit === "pct_yoy")}${c.unit === "pct_yoy" ? " YoY" : ""}`;
/** Targets as stated: "21%", "20–21%", "6.5%" (no padded decimals). */
const t = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const targetText = (c: Claim) => (c.targetHigh != null ? `${t(c.target)}–${t(c.targetHigh)}%` : `${t(c.target)}%`);

export function claimCaption(c: Claim): string {
  if (c.actual == null) return `No reported quarters for ${c.deadline} yet · target ${targetText(c)}`;
  const total = c.quartersTotal ?? 4, done = c.quartersReported ?? 0, left = Math.max(0, total - done);
  const complete = left === 0;
  return `${v(c, c.actual)} ${complete ? `for ${c.deadline}` : "year to date"} vs ${targetText(c)} target`
    + (complete ? " · final" : ` · ${left} quarter${left === 1 ? "" : "s"} left`);
}

/** Screen-reader text: every number the chart draws. */
export function claimAria(c: Claim, label: string): string {
  return `${label}: ${claimCaption(c)}.`;
}
