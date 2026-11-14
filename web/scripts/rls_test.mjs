// RLS isolation test: two anonymous users; B must not see or write A's contacts.
// Usage: node scripts/rls_test.mjs   (reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && key, "set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");

const mk = () => createClient(url, key, { auth: { persistSession: false } });

async function newUser() {
  const c = mk();
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw error;
  const seeded = await c.rpc("seed_demo_user");
  if (seeded.error) throw seeded.error;
  return { c, id: data.user.id };
}

const a = await newUser();
const b = await newUser();

const aRows = await a.c.from("contacts").select("id, user_id");
assert.ifError(aRows.error);
assert.ok(aRows.data.length > 0, "A should see its own seeded contacts");
assert.ok(aRows.data.every((r) => r.user_id === a.id), "A sees only A's rows");

// 1. B cannot read A's contacts by id.
const aIds = aRows.data.map((r) => r.id);
const peek = await b.c.from("contacts").select("id").in("id", aIds);
assert.ifError(peek.error);
assert.equal(peek.data.length, 0, "B must not read A's contacts");

// 2. B cannot read A's stints.
const stints = await b.c.from("contact_stints").select("id").eq("user_id", a.id);
assert.equal(stints.data?.length ?? 0, 0, "B must not read A's stints");

// 3. B cannot insert a row owned by A.
const forged = await b.c.from("contacts").insert({ user_id: a.id, display_name: "forged" });
assert.ok(forged.error, "B must not insert rows owned by A");

// 4. B cannot update or delete A's rows (RLS filters them out → 0 rows affected).
const upd = await b.c.from("contacts").update({ display_name: "x" }).in("id", aIds).select();
assert.equal(upd.data?.length ?? 0, 0, "B must not update A's contacts");
const del = await b.c.from("contacts").delete().in("id", aIds).select();
assert.equal(del.data?.length ?? 0, 0, "B must not delete A's contacts");

// 5. The demo template schema is not reachable from the client.
const tmpl = await b.c.schema("demo").from("contacts").select("id");
assert.ok(tmpl.error, "demo schema must not be exposed");

console.log("RLS test passed: cross-user read, insert, update, delete all blocked.");
