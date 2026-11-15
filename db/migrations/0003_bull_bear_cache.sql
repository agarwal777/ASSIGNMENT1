-- 0003: a shared, persistent cache and a global daily cap for the live bull vs bear.
-- Run once in the Supabase SQL Editor (paste this file's contents). Safe to re-run.
--
-- Why: POST /api/bull-bear calls Gemini. Without these, anyone could call it in a loop and use up the
-- project's model quota. One validated result per (company, evidence hash) is now served to every
-- visitor, and new generations stop for the day once BULL_BEAR_DAILY_CAP is reached.
-- Both tables are server-only: RLS on, no policies, so the browser's anon/user keys cannot read or
-- write them. Only the route, using the service-role key on the server, touches them.

create table if not exists public.bull_bear_cache (
  symbol       text not null,
  evidence_sha text not null,            -- sha256 of the numbered evidence + validator version
  status       text not null check (status in ('generating', 'ready')),
  payload      jsonb,                    -- {generatedAt, model, bear[], bull[], dropped{bear,bull}}
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (symbol, evidence_sha)
);

create table if not exists public.bull_bear_daily (
  day date primary key,
  n   int  not null default 0                -- new generations started that day (cache hits are free)
);

alter table public.bull_bear_cache enable row level security;
alter table public.bull_bear_daily enable row level security;

-- Decide what one request may do, atomically:
--   'cached' a ready result exists (and no refresh is due)   → serve it, no model call
--   'busy'   another request is writing it (< 3 minutes)    → ask the visitor to retry
--   'cap'    today's generation cap is used up               → no model call
--   'go'     this request generates; the row is marked 'generating'
-- A per-key advisory lock serialises concurrent first visitors (single flight).
create or replace function public.bull_bear_claim(p_symbol text, p_sha text, p_cap int, p_refresh boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bull_bear_cache;
  used int;
begin
  perform pg_advisory_xact_lock(hashtext(p_symbol || ':' || p_sha));

  select * into r from public.bull_bear_cache where symbol = p_symbol and evidence_sha = p_sha;
  if found then
    if r.status = 'ready' and (not p_refresh or r.updated_at > now() - interval '24 hours') then
      return 'cached';
    end if;
    if r.status = 'generating' and r.updated_at > now() - interval '3 minutes' then
      return 'busy';
    end if;
  end if;

  insert into public.bull_bear_daily as d (day, n) values (current_date, 1)
    on conflict (day) do update set n = d.n + 1
    returning d.n into used;
  if used > p_cap then
    update public.bull_bear_daily set n = n - 1 where day = current_date;
    return 'cap';
  end if;

  insert into public.bull_bear_cache (symbol, evidence_sha, status, updated_at)
    values (p_symbol, p_sha, 'generating', now())
    on conflict (symbol, evidence_sha) do update set status = 'generating', updated_at = now();
  return 'go';
end;
$$;

revoke all on function public.bull_bear_claim(text, text, int, boolean) from public, anon, authenticated;
grant execute on function public.bull_bear_claim(text, text, int, boolean) to service_role;
