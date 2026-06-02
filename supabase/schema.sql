-- Nebeneinkünfte Tracker – Supabase Schema
-- Ausführen in: Supabase Dashboard → SQL Editor → New Query

-- ============================================================
-- TABELLEN
-- ============================================================

create table if not exists public.clients (
  id          text        primary key,
  user_id     uuid        references auth.users not null,
  name        text        not null,
  note        text        default '',
  active      boolean     default true,
  created_at  timestamptz,
  updated_at  timestamptz default now()
);

create table if not exists public.assignments (
  id          text        primary key,
  user_id     uuid        references auth.users not null,
  date        text        not null,
  client_id   text        not null,
  description text        default '',
  fee         numeric     default 0,
  km          integer     default 0,
  km_billable boolean     default false,
  status      text        default 'open',
  paid_date   text,
  type        text        default 'mystery_shopping',
  note        text        default '',
  created_at  timestamptz,
  updated_at  timestamptz default now()
);

create table if not exists public.user_settings (
  user_id     uuid        primary key references auth.users,
  settings    jsonb       not null default '{}',
  updated_at  timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Jeder User sieht nur seine eigenen Daten
-- ============================================================

alter table public.clients       enable row level security;
alter table public.assignments   enable row level security;
alter table public.user_settings enable row level security;

-- Clients
create policy "own_clients" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Assignments
create policy "own_assignments" on public.assignments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Settings
create policy "own_settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- REALTIME
-- Änderungen werden live an andere Geräte gepusht
-- ============================================================

-- Replica Identity FULL: DELETE-Events enthalten alle Spalten (inkl. user_id)
-- Notwendig damit der user_id-Filter bei DELETE-Events funktioniert
alter table public.clients     replica identity full;
alter table public.assignments replica identity full;

alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.assignments;
