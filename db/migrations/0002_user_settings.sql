-- 0002: per-user alert thresholds and edited investor assumptions.
-- Run once in the Supabase SQL Editor (paste this file's contents). Safe to re-run.
-- Both tables are private vault rows: RLS, own rows only, same rule as contacts.

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- The brief's defaults: volume > 2× the 20-session average, or a close-to-close move beyond ±5%.
  volume_multiple numeric(4,1) not null default 2.0 check (volume_multiple >= 1.2 and volume_multiple <= 20),
  price_move_pct  numeric(4,1) not null default 5.0 check (price_move_pct >= 0.5 and price_move_pct <= 50),
  updated_at timestamptz not null default now()
);

-- One editable investor assumption per company (keyed by the snapshot's assumption id).
create table if not exists public.user_assumptions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  assumption_id text not null,
  metric text not null check (metric in ('ebitda_margin', 'revenue_growth')),
  operator text not null check (operator in ('>=', '<=')),
  target numeric(6,2) not null check (target between -100 and 100),
  deadline text not null check (deadline ~ '^FY[0-9]{2}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol, assumption_id)
);

alter table public.user_settings enable row level security;
alter table public.user_assumptions enable row level security;

drop policy if exists own_rows on public.user_settings;
create policy own_rows on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists own_rows on public.user_assumptions;
create policy own_rows on public.user_assumptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
