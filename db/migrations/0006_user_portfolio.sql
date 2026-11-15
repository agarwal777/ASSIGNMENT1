-- 0006: the investor's own portfolio (symbols), edited in the app. Null = the demo portfolio.
-- Run once in the Supabase SQL Editor (paste this file's contents). Safe to re-run.
-- The table's row-level security (own rows only, 0002) already covers the new column.

alter table public.user_settings add column if not exists portfolio text[];
