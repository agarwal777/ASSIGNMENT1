import type { Contact } from "@/lib/network";

type Row = {
  id: string; display_name: string; closeness: number | null; last_contacted: string | null; tags: string[];
  contact_stints: { org_canonical: string; role: string | null; function: string | null;
    start_date: string | null; end_date: string | null; dates_known: boolean }[];
};

/**
 * The investor's own contacts. RLS returns only this user's rows; matching happens on the device.
 * supabase-js (~60 KB gzipped) is imported here on demand, after first paint, so it stays out of
 * the initial JavaScript of every screen.
 */
let cached: Promise<Contact[]> | null = null;

/** One fetch per page load; the card list and the call sheet share it. A failure is not cached. */
export function loadNetwork(): Promise<Contact[]> {
  cached ??= fetchNetwork().catch((e) => { cached = null; throw e; });
  return cached;
}

async function fetchNetwork(): Promise<Contact[]> {
  const { ensureDemoSession, supabase } = await import("@/lib/supabase");
  await ensureDemoSession();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, display_name, closeness, last_contacted, tags, contact_stints(org_canonical, role, function, start_date, end_date, dates_known)");
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, name: r.display_name, closeness: r.closeness ?? 3, lastContacted: r.last_contacted, tags: r.tags,
    stints: r.contact_stints.map((s) => ({
      org: s.org_canonical, role: s.role, function: s.function ?? "other",
      start: s.start_date, end: s.end_date, datesKnown: s.dates_known,
    })),
  }));
}
