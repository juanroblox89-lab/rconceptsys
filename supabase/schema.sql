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
-- SECURITY HELPERS
-- ============================================================
-- SECURITY DEFINER so it can read public.users regardless of the caller's RLS.
-- Used by policies/triggers to gate admin-only operations on the server side
-- instead of trusting client-side JavaScript role checks.
create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and approved = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and approved = true and role = 'admin'
  );
$$;

revoke all on function public.is_approved() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_admin() to authenticated;

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

create policy "Users read own or approved team" on public.users
  for select to authenticated using (id = auth.uid() or public.is_approved());
create policy "Approved users read roles" on public.roles
  for select to authenticated using (public.is_approved());
create policy "Approved users read clients" on public.clients
  for select to authenticated using (public.is_approved());
create policy "Approved users read assignments" on public.assignments
  for select to authenticated using (public.is_approved());
create policy "Users read own invoices" on public.invoices
  for select to authenticated using (public.is_admin() or (public.is_approved() and "employeeId" = auth.uid()::text));
create policy "Users read own admin invoices" on public.admin_invoices
  for select to authenticated using (public.is_admin() or (public.is_approved() and "employeeId" = auth.uid()::text));
create policy "Approved users read rate cards" on public.rate_cards
  for select to authenticated using (public.is_approved());
create policy "Approved users read formats" on public.formats
  for select to authenticated using (public.is_approved());
create policy "Approved users read hooks" on public.hooks
  for select to authenticated using (public.is_approved());
create policy "Approved users read scripts" on public.scripts
  for select to authenticated using (public.is_approved());
create policy "Approved users read assets" on public.assets
  for select to authenticated using (public.is_approved());
create policy "Approved users read references" on public.references
  for select to authenticated using (public.is_approved());
create policy "Approved users read sops" on public.sops
  for select to authenticated using (public.is_approved());
create policy "Users read own chats" on public.chats
  for select to authenticated using (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text));
create policy "Users read own marketing visits" on public.marketing_visits
  for select to authenticated using (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text));

create policy "Users insert own profile" on public.users
  for insert to authenticated with check (id = auth.uid() or public.is_admin());
create policy "Users update own profile" on public.users
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "Admins delete users" on public.users
  for delete to authenticated using (public.is_admin());

create policy "Admins manage roles" on public.roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage clients" on public.clients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins create assignments" on public.assignments
  for insert to authenticated with check (public.is_admin());
create policy "Admins or assignees update assignments" on public.assignments
  for update to authenticated
  using (public.is_admin() or (public.is_approved() and "employeeId" = auth.uid()::text))
  with check (public.is_admin() or (public.is_approved() and "employeeId" = auth.uid()::text));
create policy "Admins delete assignments" on public.assignments
  for delete to authenticated using (public.is_admin());
create policy "Users manage own invoices" on public.invoices
  for all to authenticated
  using (public.is_admin() or (public.is_approved() and "employeeId" = auth.uid()::text))
  with check (public.is_admin() or (public.is_approved() and "employeeId" = auth.uid()::text));
create policy "Admins manage admin invoices" on public.admin_invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage rate cards" on public.rate_cards
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage formats" on public.formats
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage hooks" on public.hooks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage scripts" on public.scripts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Approved users manage assets" on public.assets
  for all to authenticated using (public.is_approved()) with check (public.is_approved());
create policy "Admins manage references" on public.references
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage sops" on public.sops
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Users manage own chats" on public.chats
  for all to authenticated
  using (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text))
  with check (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text));
create policy "Users manage own marketing visits" on public.marketing_visits
  for all to authenticated
  using (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text))
  with check (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text));

-- ============================================================
-- PRIVILEGE ESCALATION GUARD
-- ============================================================
-- Even though users can update their own profile, they must NOT be able to
-- change their own role or approval status. Only admins (or the service role
-- running with RLS bypass) may alter these fields.
create or replace function public.enforce_user_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only constrain end users. The service role / SQL editor (used to bootstrap
  -- the first admin and manage approvals) is allowed through.
  if auth.role() <> 'authenticated' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.uid := auth.uid()::text;
    new.email := auth.jwt() ->> 'email';
    new.role := 'viewer';
    new.approved := false;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.approved is distinct from old.approved
     or new.id is distinct from old.id
     or new.uid is distinct from old.uid
     or new.email is distinct from old.email
     or new."createdAt" is distinct from old."createdAt" then
    raise exception 'No autorizado para modificar el rol o el estado de aprobación.';
  end if;
  return new;
end;
$$;

drop trigger if exists users_privilege_guard on public.users;
create trigger users_privilege_guard
  before insert or update on public.users
  for each row execute function public.enforce_user_privilege_guard();

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

create policy "Approved upload access" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('assets', 'logos') and public.is_approved());

create policy "Owners update uploads" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('assets', 'logos')
    and (public.is_admin() or (public.is_approved() and owner_id::text = auth.uid()::text))
  )
  with check (
    bucket_id in ('assets', 'logos')
    and (public.is_admin() or (public.is_approved() and owner_id::text = auth.uid()::text))
  );

create policy "Owners delete uploads" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('assets', 'logos')
    and (public.is_admin() or (public.is_approved() and owner_id::text = auth.uid()::text))
  );

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
