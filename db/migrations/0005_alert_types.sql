-- 0005: the investor's per-type alert preferences ("Alert me" / "As scored" / "Mute").
-- Run once in the Supabase SQL Editor (paste this file's contents). Safe to re-run.
-- Stored as {"M&A": "alert", "dividend": "mute", …}; a type not listed is scored as built.
-- The table's row-level security (own rows only, 0002) already covers the new column.

alter table public.user_settings add column if not exists type_prefs jsonb not null default '{}'::jsonb;
