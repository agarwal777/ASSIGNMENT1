import type { Contact } from "@/lib/network";
import { ensureDemoSession, supabase } from "@/lib/supabase";

type Row = {
  id: string; display_name: string; closeness: number | null; last_contacted: string | null; tags: string[];
  contact_stints: { org_canonical: string; role: string | null; function: string | null;
    start_date: string | null; end_date: string | null; dates_known: boolean }[];
};

/** The investor's own contacts. RLS returns only this user's rows; nothing leaves the browser. */
export async function loadNetwork(): Promise<Contact[]> {
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
