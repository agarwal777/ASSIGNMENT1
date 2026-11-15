// The investor's alert thresholds: one private row per user (db/migrations/0002, RLS own rows).
// Read once per page load and shared; a save notifies every open screen so Today and Portfolio
// re-score moves without a reload. Defaults apply until a row exists, or if the database can't be reached.
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/moves";

let cached: Promise<Thresholds> | null = null;
let current: Thresholds | null = null;
const listeners = new Set<(t: Thresholds) => void>();

export function loadThresholds(): Promise<Thresholds> {
  cached ??= fetchThresholds().then((t) => (current = t)).catch(() => { cached = null; return DEFAULT_THRESHOLDS; });
  return cached;
}

export function onThresholds(l: (t: Thresholds) => void): () => void {
  listeners.add(l);
  if (current) l(current);
  return () => { listeners.delete(l); };
}

async function fetchThresholds(): Promise<Thresholds> {
  const { ensureDemoSession, supabase } = await import("@/lib/supabase");
  await ensureDemoSession();
  // "*" so a database without migration 0005 (no type_prefs column) still loads the thresholds.
  const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_THRESHOLDS;
  const types = (data.type_prefs ?? {}) as Record<string, "alert" | "mute">;
  const portfolio = Array.isArray(data.portfolio) ? (data.portfolio as string[]) : null;
  return { volumeMultiple: Number(data.volume_multiple), priceMovePct: Number(data.price_move_pct), types, portfolio };
}

/** Saves a change merged into the current settings, so saving thresholds keeps type preferences and vice versa. */
export async function saveThresholds(change: Partial<Thresholds>): Promise<void> {
  const { ensureDemoSession, supabase } = await import("@/lib/supabase");
  const uid = await ensureDemoSession();
  const t: Thresholds = { ...(current ?? (await loadThresholds())), ...change };
  const row: Record<string, unknown> = { user_id: uid, volume_multiple: t.volumeMultiple, price_move_pct: t.priceMovePct,
    updated_at: new Date().toISOString() };
  // Only written when there is something to write, so threshold saves work before migration 0005 is run.
  if (change.types || Object.keys(t.types ?? {}).length) row.type_prefs = t.types ?? {};
  // Only written once the investor edits it, so other saves work before migration 0006 is run.
  if (change.portfolio !== undefined || t.portfolio) row.portfolio = t.portfolio ?? null;
  const { error } = await supabase.from("user_settings").upsert(row, { onConflict: "user_id" });
  if (error) throw error;
  current = t;
  cached = Promise.resolve(t);
  listeners.forEach((l) => l(t));
}

/** Reset demo: back to the brief's defaults on every open screen. */
export function resetThresholds(): void {
  current = DEFAULT_THRESHOLDS;
  cached = Promise.resolve(current);
  listeners.forEach((l) => l(DEFAULT_THRESHOLDS));
}
