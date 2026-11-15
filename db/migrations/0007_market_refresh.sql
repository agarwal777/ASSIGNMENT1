-- 0007: data the daily cloud refresh (py/refresh.py, run by Vercel Cron) adds after the committed snapshot.
-- Run once in the Supabase SQL Editor (paste this file's contents). Safe to re-run.
--
-- Public market data only (NSE filings, end-of-day prices): anyone may read it, so the build step can
-- merge it with the public anon key. Only the server's service-role key can write (no write policies;
-- the service role bypasses RLS). Nothing about any investor is stored here.

create table if not exists public.market_events (
  id          text primary key,                 -- same id scheme as web/data/digest.json events
  symbol      text not null,
  at          timestamptz not null,
  payload     jsonb not null,                   -- the full event, in the digest's format
  fetched_at  timestamptz not null default now()
);
create index if not exists market_events_at on public.market_events (at desc);

create table if not exists public.market_prices (
  symbol  text not null,
  day     date not null,
  close   numeric not null,
  volume  bigint not null,
  primary key (symbol, day)
);

create table if not exists public.refresh_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  window_from date,
  window_to   date,
  events      int,
  prices      int,
  deploy      text,                              -- 'triggered' | 'nothing new' | 'no hook' | 'failed: …'
  notes       text
);

alter table public.market_events enable row level security;
alter table public.market_prices enable row level security;
alter table public.refresh_runs  enable row level security;

drop policy if exists market_events_read on public.market_events;
create policy market_events_read on public.market_events for select to anon, authenticated using (true);
drop policy if exists market_prices_read on public.market_prices;
create policy market_prices_read on public.market_prices for select to anon, authenticated using (true);
drop policy if exists refresh_runs_read on public.refresh_runs;
create policy refresh_runs_read on public.refresh_runs for select to anon, authenticated using (true);
