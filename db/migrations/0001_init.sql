-- FINN schema v1 + Row Level Security (RLS).
-- Public corpus: readable by any signed-in user (anonymous included), written only by the service role.
-- Private vault: each row carries user_id; a user sees and edits only their own rows.

create extension if not exists pgcrypto;

-- ───────────── Public corpus ─────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  nse_symbol text unique not null,
  bse_code text,
  name text not null,
  sector text,
  size_bucket text,
  is_lender boolean not null default false
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  doc_type text not null,            -- announcement | results_xbrl | transcript | annual_report
  category text,                     -- announcement category from the reference doc
  title text,
  url text,
  sha256 text not null,
  version int not null default 1,
  published_at timestamptz,
  status text not null default 'active',
  unique (sha256, version)
);

create table prices (
  company_id uuid references companies(id) on delete cascade,
  trade_date date not null,
  close numeric, volume bigint,
  primary key (company_id, trade_date)
);

create table facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  metric text not null,
  period text not null,              -- e.g. Q2FY27
  basis text not null check (basis in ('consolidated','standalone')),
  value_cr numeric not null,
  document_id uuid references documents(id),
  source_ref text                    -- XBRL element / page + original unit
);

create table promises (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  said_at date not null,
  statement_verbatim text not null,
  speaker_role text,
  metric text not null,
  target_low numeric, target_high numeric, unit text,
  deadline_period text,
  status text not null default 'unverifiable'
    check (status in ('delivered','on_track','revised','missed','dropped','unverifiable')),
  document_id uuid references documents(id),
  page int
);

create table events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  category text not null,
  summary text,
  base_materiality numeric,
  surprise numeric,
  occurred_at timestamptz not null,
  document_id uuid references documents(id)
);

create table executives (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  din text
);

-- Executive career history comes from public filings, so it is public.
create table executive_stints (
  id uuid primary key default gen_random_uuid(),
  executive_id uuid not null references executives(id) on delete cascade,
  org_canonical text not null,
  role text, function text,
  start_date date, end_date date,
  dates_known boolean not null default false,
  document_id uuid references documents(id)
);

create table llm_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  model text, task text,
  tokens_in int, tokens_out int, cost_inr numeric, cache_hit boolean
);

-- ───────────── Private vault ─────────────
-- Contact stints are a separate table from executive_stints so every private row has user_id
-- and RLS is a single, uniform rule.
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null,
  closeness int check (closeness between 1 and 5),
  last_contacted date,
  tags text[] not null default '{}',
  is_synthetic boolean not null default true
);

create table contact_stints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  org_canonical text not null,
  role text, function text,
  start_date date, end_date date,
  dates_known boolean not null default true
);

create table theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  summary text,
  unique (user_id, company_id)
);

create table assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thesis_id uuid not null references theses(id) on delete cascade,
  kind text not null check (kind in ('numeric','qualitative')),
  text text not null,
  metric text, operator text, target numeric, deadline_period text,
  invalidation text,
  source text not null check (source in ('management','investor')),
  editable boolean not null default false,
  status text
);

create table evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assumption_id uuid not null references assumptions(id) on delete cascade,
  source_type text not null, source_id uuid not null,
  stance text check (stance in ('supports','contradicts','neutral','insufficient')),
  rationale text, confidence numeric, created_by text
);

create table overlaps (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  executive_id uuid not null references executives(id) on delete cascade,
  strength numeric not null,
  dates_confirmed boolean not null,
  explanation text not null,
  primary key (user_id, contact_id, executive_id)
);

create table event_scores (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  score numeric not null,
  bucket text not null check (bucket in ('needs_you','worth_a_read','collapsed')),
  reasons text[] not null default '{}',
  primary key (user_id, event_id)
);

-- ───────────── RLS ─────────────
do $$
declare t text;
begin
  -- Public corpus: read-only for signed-in users; no write policy, so only the service role writes.
  foreach t in array array['companies','documents','prices','facts','promises','events',
                           'executives','executive_stints'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select to authenticated using (true)', t);
  end loop;

  -- llm_calls: RLS on, no policies → invisible to clients.
  alter table llm_calls enable row level security;

  -- Private vault: own rows only, for every operation.
  foreach t in array array['contacts','contact_stints','theses','assumptions',
                           'evidence_links','overlaps','event_scores'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy own_rows on %I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ───────────── Demo template (synthetic network, copied per visitor) ─────────────
-- Lives in a separate schema that the API does not expose; only seed_demo_user() reads it.
create schema if not exists demo;
create table demo.contacts       (like public.contacts including defaults);
create table demo.contact_stints (like public.contact_stints including defaults);
alter table demo.contacts       alter column user_id drop not null, alter column user_id drop default;
alter table demo.contact_stints alter column user_id drop not null, alter column user_id drop default;
revoke all on schema demo from anon, authenticated;

-- Copies the synthetic network into the caller's own rows. Idempotent: does nothing if already seeded.
create or replace function public.seed_demo_user() returns int
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.contacts where user_id = uid) then return 0; end if;

  create temp table id_map on commit drop as
    select id as old_id, gen_random_uuid() as new_id from demo.contacts;

  insert into public.contacts (id, user_id, display_name, closeness, last_contacted, tags, is_synthetic)
  select m.new_id, uid, c.display_name, c.closeness, c.last_contacted, c.tags, true
  from demo.contacts c join id_map m on m.old_id = c.id;

  insert into public.contact_stints (user_id, contact_id, org_canonical, role, function,
                                     start_date, end_date, dates_known)
  select uid, m.new_id, s.org_canonical, s.role, s.function, s.start_date, s.end_date, s.dates_known
  from demo.contact_stints s join id_map m on m.old_id = s.contact_id;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.seed_demo_user() from public, anon;
grant execute on function public.seed_demo_user() to authenticated;

-- Two placeholder synthetic contacts so B0 has something to protect. Real network.csv lands in B4.
insert into demo.contacts (id, display_name, closeness, last_contacted, tags) values
  ('00000000-0000-0000-0000-000000000001', 'Synthetic Contact A', 4, '2026-03-01', '{finance}'),
  ('00000000-0000-0000-0000-000000000002', 'Synthetic Contact B', 2, '2025-09-15', '{chemicals}');
insert into demo.contact_stints (contact_id, org_canonical, role, function, start_date, end_date, dates_known) values
  ('00000000-0000-0000-0000-000000000001', 'Example Industries', 'Treasury Manager', 'finance', '2016-04-01', '2019-03-31', true),
  ('00000000-0000-0000-0000-000000000002', 'Example Chemicals', 'Plant Head', 'operations', null, null, false);
