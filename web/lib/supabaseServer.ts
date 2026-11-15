// SERVER ONLY. A Supabase client with the service-role key, for the bull-vs-bear cache, the daily cap
// and the llm_calls log (tables with RLS on and no policies, unreachable from the browser).
// Never import this from a "use client" component: the key must not reach a browser bundle. Only
// route handlers import it; Next.js does not expose env vars without the NEXT_PUBLIC_ prefix to clients.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** null when SUPABASE_SERVICE_ROLE_KEY isn't configured (the route then says so instead of failing). */
export function serviceClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
