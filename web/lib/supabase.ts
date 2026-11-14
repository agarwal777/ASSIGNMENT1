import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client. Uses the anon (publishable) key only; RLS does the isolation.
export const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** Sign in as an anonymous demo user (no login screen) and copy the demo network into their rows. */
export async function ensureDemoSession(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (!existing.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  const { error: seedError } = await supabase.rpc("seed_demo_user");
  if (seedError) throw seedError;
  const { data } = await supabase.auth.getUser();
  return data.user!.id;
}
