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
  const { data, error } = await supabase.from("user_settings").select("volume_multiple, price_move_pct").maybeSingle();
  if (error) throw error;
  return data ? { volumeMultiple: Number(data.volume_multiple), priceMovePct: Number(data.price_move_pct) } : DEFAULT_THRESHOLDS;
}

export async function saveThresholds(t: Thresholds): Promise<void> {
  const { ensureDemoSession, supabase } = await import("@/lib/supabase");
  const uid = await ensureDemoSession();
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: uid, volume_multiple: t.volumeMultiple, price_move_pct: t.priceMovePct, updated_at: new Date().toISOString() },
    { onConflict: "user_id" });
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
