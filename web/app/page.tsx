import Today from "@/components/Today";
import digest from "@/data/digest.json";
import type { Digest } from "@/lib/digest";

// Public market data is read from committed JSON at build time (prototype choice);
// the private vault (contacts, theses) lives in Supabase behind RLS.
export default function Page() {
  return <Today digest={digest as unknown as Digest} />;
}
