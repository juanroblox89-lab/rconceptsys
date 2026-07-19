-- ============================================================
-- Creative Production OS - Supabase Schema
-- Migrated from Firebase Firestore (collections) to PostgreSQL
-- Run this in the Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- Enable UUID extension (required for gen_random_uuid())
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. USERS TABLE (mirrors auth.users + app profile data)
-- ============================================================
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  uid text unique,                       -- Supabase auth user id
  nombre text,
  email text unique,
  "photoURL" text,
  phone text,
  approved boolean default false,
  role text default 'viewer',
  "allowedClients" jsonb default '[]'::jsonb,  -- client visibility filter
  "marketingVisits" integer default 0,         -- visit counter for bonus logic
  "fcmToken" text,                             -- FCM push notification token
  "fcmTokenUpdatedAt" timestamptz,             -- when token was last refreshed
  platform text,                               -- 'android' | 'ios' | 'web'
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

-- ============================================================
-- 2. ROLES TABLE
-- ============================================================
create table if not exists public.roles (
  id text primary key,                   -- e.g. 'admin', 'editor', 'viewer'
  name text,
  "allowedModules" jsonb default '[]'::jsonb,
  description text,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 3. CLIENTS TABLE
-- ============================================================
create table if not exists public.clients (
  id text primary key,
  name text,
  logo text,
  package text,
  status text default 'Activo',
  strategy jsonb default '{}'::jsonb,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

-- ============================================================
-- 4. ASSIGNMENTS TABLE (production pipeline)
-- ============================================================
create table if not exists public.assignments (
  id text primary key,
  "projectId" text,
  "stageIndex" integer default 0,
  "employeeId" text,
  type text,                             -- 'Grabación' | 'Edición' | 'Subida'
  client text,
  title text,
  description text,
  "assignedDate" timestamptz default now(),
  "dueDate" timestamptz,
  status text default 'Pendiente',       -- 'Pendiente' | 'En Progreso' | 'Completado' | 'blocked'
  "createdBy" text,
  "linkedScript" text,
  "linkedAsset" text,
  billing jsonb,
  "videoLength" text,
  "updatedAt" timestamptz default now()
);

-- ============================================================
-- 5. INVOICES (employee reported)
-- ============================================================
create table if not exists public.invoices (
  id text primary key,                   -- 'emp-inv-{userId}'
  "employeeId" text,
  "employeeName" text,
  type text,
  client text,
  amount numeric default 0,
  observations text,
  items jsonb default '[]'::jsonb,
  "createdAt" timestamptz default now(),
  status text default 'Pendiente'
);

-- ============================================================
-- 6. ADMIN INVOICES (consolidated)
-- ============================================================
create table if not exists public.admin_invoices (
  id text primary key,                   -- 'adm-inv-{userId}'
  "employeeId" text,
  "employeeName" text,
  type text,
  client text,
  amount numeric default 0,
  observations text,
  items jsonb default '[]'::jsonb,
  "createdAt" timestamptz default now(),
  status text default 'Pendiente'
);

-- ============================================================
-- 7. RATE CARDS
-- ============================================================
create table if not exists public.rate_cards (
  id text primary key,
  name text,
  type text,
  amount numeric,
  description text,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 8. FORMATS (narrative structures)
-- ============================================================
create table if not exists public.formats (
  id text primary key,
  name text,
  description text,
  structure jsonb,
  kpis jsonb,
  "caseStudies" jsonb,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 9. HOOKS (retention patterns)
-- ============================================================
create table if not exists public.hooks (
  id text primary key,
  name text,
  pattern text,
  variations jsonb,
  examples jsonb,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 10. SCRIPTS (recommended copies)
-- ============================================================
create table if not exists public.scripts (
  id text primary key,
  "clientId" text,
  title text,
  content text,
  tags jsonb default '[]'::jsonb,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 11. ASSETS (file metadata)
-- ============================================================
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  "clientId" text,
  name text,
  url text,
  type text,
  metadata jsonb default '{}'::jsonb,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 12. REFERENCES (inspiration library)
-- ============================================================
create table if not exists public.references (
  id text primary key,
  title text,
  url text,
  platform text,
  analysis text,
  tags jsonb default '[]'::jsonb,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 13. SOPS (standard operating procedures)
-- ============================================================
create table if not exists public.sops (
  id text primary key,
  title text,
  role text,
  steps jsonb default '[]'::jsonb,
  "autoBilling" jsonb,
  "createdAt" timestamptz default now()
);

-- ============================================================
-- 14. CHATS (AI conversation history)
-- ============================================================
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  "userId" text,
  title text,
  messages jsonb default '[]'::jsonb,
  context text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

-- ============================================================
-- 15. MARKETING VISITS (sales tracking)
-- ============================================================
create table if not exists public.marketing_visits (
  id uuid primary key default gen_random_uuid(),
  "userId" text,
  "clientName" text,
  "visitDate" timestamptz default now(),
  notes text,
  status text
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Basic policies
-- ============================================================
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.clients enable row level security;
alter table public.assignments enable row level security;
alter table public.invoices enable row level security;
alter table public.admin_invoices enable row level security;
alter table public.rate_cards enable row level security;
alter table public.formats enable row level security;
alter table public.hooks enable row level security;
alter table public.scripts enable row level security;
alter table public.assets enable row level security;
alter table public.references enable row level security;
alter table public.sops enable row level security;
alter table public.chats enable row level security;
alter table public.marketing_visits enable row level security;

-- Authenticated users can read all tables (app is internal)
create policy "Authenticated read access" on public.users
  for select to authenticated using (true);
create policy "Authenticated read access" on public.roles
  for select to authenticated using (true);
create policy "Authenticated read access" on public.clients
  for select to authenticated using (true);
create policy "Authenticated read access" on public.assignments
  for select to authenticated using (true);
create policy "Authenticated read access" on public.invoices
  for select to authenticated using (true);
create policy "Authenticated read access" on public.admin_invoices
  for select to authenticated using (true);
create policy "Authenticated read access" on public.rate_cards
  for select to authenticated using (true);
create policy "Authenticated read access" on public.formats
  for select to authenticated using (true);
create policy "Authenticated read access" on public.hooks
  for select to authenticated using (true);
create policy "Authenticated read access" on public.scripts
  for select to authenticated using (true);
create policy "Authenticated read access" on public.assets
  for select to authenticated using (true);
create policy "Authenticated read access" on public.references
  for select to authenticated using (true);
create policy "Authenticated read access" on public.sops
  for select to authenticated using (true);
create policy "Authenticated read access" on public.chats
  for select to authenticated using (true);
create policy "Authenticated read access" on public.marketing_visits
  for select to authenticated using (true);

-- Authenticated users can insert/update/delete (app manages permissions in JS)
create policy "Authenticated write access" on public.users
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.roles
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.clients
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.assignments
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.invoices
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.admin_invoices
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.rate_cards
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.formats
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.hooks
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.scripts
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.assets
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.references
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.sops
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.chats
  for all to authenticated using (true) with check (true);
create policy "Authenticated write access" on public.marketing_visits
  for all to authenticated using (true) with check (true);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Storage policies: authenticated users can upload/read
create policy "Public read access" on storage.objects
  for select using (bucket_id in ('assets', 'logos'));

create policy "Authenticated upload access" on storage.objects
  for insert to authenticated with check (bucket_id in ('assets', 'logos'));

create policy "Authenticated delete access" on storage.objects
  for delete to authenticated using (bucket_id in ('assets', 'logos'));

-- ============================================================
-- REALTIME PUBLICATION (for onSnapshot equivalent)
-- ============================================================
alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.invoices;
alter publication supabase_realtime add table public.admin_invoices;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

create trigger set_updated_at
  before update on public.clients
  for each row execute function public.handle_updated_at();

create trigger set_updated_at
  before update on public.assignments
  for each row execute function public.handle_updated_at();

create trigger set_updated_at
  before update on public.chats
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 16. SOP SUBMISSIONS TABLE
-- ============================================================
create table if not exists public.sop_submissions (
  id text primary key,
  "sopId" text not null references public.sops(id) on delete cascade,
  "userId" text not null references public.users(uid) on delete cascade,
  "userName" text,
  "sopTitle" text,
  status text default 'active',
  steps jsonb default '[]'::jsonb,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

alter table public.sop_submissions enable row level security;

create policy "Authenticated read sop_submissions" on public.sop_submissions
  for select to authenticated using (true);

create policy "Authenticated write sop_submissions" on public.sop_submissions
  for all to authenticated using (true) with check (true);

create trigger set_updated_at
  before update on public.sop_submissions
  for each row execute function public.handle_updated_at();

alter publication supabase_realtime add table public.sop_submissions;

