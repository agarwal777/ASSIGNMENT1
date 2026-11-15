// An investor assumption checked against reported quarters: the same rule as workers/thesis.py
// (year-to-date over the deadline's fiscal year; met/missed only once that year has ended).
import type { Claim, PromiseStatus, QuarterRow } from "@/lib/types";

export type AssumptionInput = { metric: "ebitda_margin" | "revenue_growth"; operator: ">=" | "<="; target: number; deadline: string };
export const METRICS: { value: AssumptionInput["metric"]; label: string }[] = [
  { value: "ebitda_margin", label: "EBITDA margin" }, { value: "revenue_growth", label: "Revenue growth (YoY)" },
];
export const DEADLINES = ["FY27", "FY28", "FY29"];

const fyEnd = (fy: string) => `20${fy.slice(-2)}-03-31`;
const prior = (p: string) => p.replace(/FY(\d{2})$/, (_, y) => `FY${String(Number(y) - 1).padStart(2, "0")}`);

export function assumptionText(a: AssumptionInput): string {
  const m = a.metric === "ebitda_margin" ? "EBITDA margin" : "Revenue growth";
  return `${m} ${a.operator === ">=" ? "at or above" : "at or below"} ${a.target.toLocaleString("en-IN", { maximumFractionDigits: 2 })}% for ${a.deadline}`;
}

/** Year-to-date actual for the deadline's fiscal year, status and the bullet-chart claim. */
export function checkAssumption(a: AssumptionInput, quarters: QuarterRow[], dataTo: string): {
  status: PromiseStatus; claim: Claim; evidence: string;
} {
  const fy = quarters.filter((q) => q.period.endsWith(a.deadline) && q.revenue);
  let actual: number | null = null;
  if (a.metric === "ebitda_margin") {
    const qs = fy.filter((q) => q.ebitdaMargin);
    const rev = qs.reduce((s, q) => s + q.revenue!.value, 0);
    // Σ(margin × revenue) ÷ Σ revenue = Σ EBITDA ÷ Σ revenue (margins are stored to 2 decimals).
    if (qs.length && rev) actual = Math.round((qs.reduce((s, q) => s + q.ebitdaMargin!.value * q.revenue!.value, 0) / rev) * 100) / 100;
  } else {
    const pairs = fy.map((q) => [q, quarters.find((p) => p.period === prior(q.period))] as const).filter(([, p]) => p?.revenue);
    const cur = pairs.reduce((s, [q]) => s + q.revenue!.value, 0), old = pairs.reduce((s, [, p]) => s + p!.revenue!.value, 0);
    if (pairs.length === fy.length && fy.length && old > 0) actual = Math.round(((100 * (cur - old)) / old) * 10) / 10;
  }
  const done = fy.length;
  let status: PromiseStatus = "cant_check";
  if (actual != null) {
    const ok = a.operator === ">=" ? actual >= a.target : actual <= a.target;
    const passed = fyEnd(a.deadline) < dataTo;
    status = passed ? (ok ? "met" : "missed") : ok ? "on_track" : "behind";
  }
  return {
    status,
    claim: { metric: a.metric, unit: a.metric === "ebitda_margin" ? "pct" : "pct_yoy", deadline: a.deadline, status,
      target: a.target, actual: actual ?? undefined, quartersReported: done || undefined, quartersTotal: 4 },
    evidence: actual == null ? `no reported quarters for ${a.deadline} yet` : `${actual}% year to date (${fy[0].period}–${fy[done - 1].period})`,
  };
}

/** The investor's saved edit for this company, if any (db/migrations/0002, RLS own rows). */
export async function loadSavedAssumption(symbol: string): Promise<(AssumptionInput & { id: string }) | null> {
  const { ensureDemoSession, supabase } = await import("@/lib/supabase");
  await ensureDemoSession();
  const { data, error } = await supabase.from("user_assumptions")
    .select("assumption_id, metric, operator, target, deadline").eq("symbol", symbol).maybeSingle();
  if (error) throw error;
  return data ? { id: data.assumption_id, metric: data.metric, operator: data.operator, target: Number(data.target), deadline: data.deadline } : null;
}

export async function saveAssumption(symbol: string, id: string, a: AssumptionInput): Promise<AssumptionInput> {
  const { ensureDemoSession, supabase } = await import("@/lib/supabase");
  const uid = await ensureDemoSession();
  const { data, error } = await supabase.from("user_assumptions").upsert(
    // Explicit columns: a row loaded back carries extra fields (its id) that must not be written.
    { user_id: uid, symbol, assumption_id: id, metric: a.metric, operator: a.operator, target: a.target, deadline: a.deadline,
      updated_at: new Date().toISOString() },
    { onConflict: "user_id,symbol,assumption_id" }).select("metric, operator, target, deadline").single();
  if (error) throw error;
  return { metric: data.metric, operator: data.operator, target: Number(data.target), deadline: data.deadline };
}
