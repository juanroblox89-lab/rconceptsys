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

drop policy if exists "Authenticated read access" on public.users;
drop policy if exists "Authenticated read access" on public.roles;
drop policy if exists "Authenticated read access" on public.clients;
drop policy if exists "Authenticated read access" on public.assignments;
drop policy if exists "Authenticated read access" on public.invoices;
drop policy if exists "Authenticated read access" on public.admin_invoices;
drop policy if exists "Authenticated read access" on public.rate_cards;
drop policy if exists "Authenticated read access" on public.formats;
drop policy if exists "Authenticated read access" on public.hooks;
drop policy if exists "Authenticated read access" on public.scripts;
drop policy if exists "Authenticated read access" on public.assets;
drop policy if exists "Authenticated read access" on public.references;
drop policy if exists "Authenticated read access" on public.sops;
drop policy if exists "Authenticated read access" on public.chats;
drop policy if exists "Authenticated read access" on public.marketing_visits;

drop policy if exists "Authenticated write access" on public.users;
drop policy if exists "Authenticated write access" on public.roles;
drop policy if exists "Authenticated write access" on public.clients;
drop policy if exists "Authenticated write access" on public.assignments;
drop policy if exists "Authenticated write access" on public.invoices;
drop policy if exists "Authenticated write access" on public.admin_invoices;
drop policy if exists "Authenticated write access" on public.rate_cards;
drop policy if exists "Authenticated write access" on public.formats;
drop policy if exists "Authenticated write access" on public.hooks;
drop policy if exists "Authenticated write access" on public.scripts;
drop policy if exists "Authenticated write access" on public.assets;
drop policy if exists "Authenticated write access" on public.references;
drop policy if exists "Authenticated write access" on public.sops;
drop policy if exists "Authenticated write access" on public.chats;
drop policy if exists "Authenticated write access" on public.marketing_visits;

drop policy if exists "Users read own or approved team" on public.users;
drop policy if exists "Approved users read roles" on public.roles;
drop policy if exists "Approved users read clients" on public.clients;
drop policy if exists "Approved users read assignments" on public.assignments;
drop policy if exists "Users read own invoices" on public.invoices;
drop policy if exists "Users read own admin invoices" on public.admin_invoices;
drop policy if exists "Approved users read rate cards" on public.rate_cards;
drop policy if exists "Approved users read formats" on public.formats;
drop policy if exists "Approved users read hooks" on public.hooks;
drop policy if exists "Approved users read scripts" on public.scripts;
drop policy if exists "Approved users read assets" on public.assets;
drop policy if exists "Approved users read references" on public.references;
drop policy if exists "Approved users read sops" on public.sops;
drop policy if exists "Users read own chats" on public.chats;
drop policy if exists "Users read own marketing visits" on public.marketing_visits;

drop policy if exists "Users insert own profile" on public.users;
drop policy if exists "Users update own profile" on public.users;
drop policy if exists "Admins delete users" on public.users;
drop policy if exists "Admins manage roles" on public.roles;
drop policy if exists "Admins manage clients" on public.clients;
drop policy if exists "Admins create assignments" on public.assignments;
drop policy if exists "Admins or assignees update assignments" on public.assignments;
drop policy if exists "Admins delete assignments" on public.assignments;
drop policy if exists "Users manage own invoices" on public.invoices;
drop policy if exists "Admins manage admin invoices" on public.admin_invoices;
drop policy if exists "Admins manage rate cards" on public.rate_cards;
drop policy if exists "Admins manage formats" on public.formats;
drop policy if exists "Admins manage hooks" on public.hooks;
drop policy if exists "Admins manage scripts" on public.scripts;
drop policy if exists "Approved users manage assets" on public.assets;
drop policy if exists "Admins manage references" on public.references;
drop policy if exists "Admins manage sops" on public.sops;
drop policy if exists "Users manage own chats" on public.chats;
drop policy if exists "Users manage own marketing visits" on public.marketing_visits;

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

create or replace function public.enforce_user_privilege_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' or public.is_admin() then
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
    raise exception 'No autorizado para modificar campos privilegiados.';
  end if;
  return new;
end;
$$;

drop trigger if exists users_privilege_guard on public.users;
create trigger users_privilege_guard
  before insert or update on public.users
  for each row execute function public.enforce_user_privilege_guard();

drop policy if exists "Authenticated upload access" on storage.objects;
drop policy if exists "Authenticated delete access" on storage.objects;
drop policy if exists "Approved upload access" on storage.objects;
drop policy if exists "Owners update uploads" on storage.objects;
drop policy if exists "Owners delete uploads" on storage.objects;

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

do $$
begin
  if to_regclass('public.system_config') is not null then
    execute 'alter table public.system_config enable row level security';
    execute 'drop policy if exists "Authenticated read access" on public.system_config';
    execute 'drop policy if exists "Authenticated write access" on public.system_config';
    execute 'drop policy if exists "Approved users read system config" on public.system_config';
    execute 'drop policy if exists "Admins manage system config" on public.system_config';
    execute 'create policy "Approved users read system config" on public.system_config for select to authenticated using (public.is_approved())';
    execute 'create policy "Admins manage system config" on public.system_config for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.system_rules') is not null then
    execute 'alter table public.system_rules enable row level security';
    execute 'drop policy if exists "Authenticated read access" on public.system_rules';
    execute 'drop policy if exists "Authenticated write access" on public.system_rules';
    execute 'drop policy if exists "Approved users read system rules" on public.system_rules';
    execute 'drop policy if exists "Admins manage system rules" on public.system_rules';
    execute 'create policy "Approved users read system rules" on public.system_rules for select to authenticated using (public.is_approved())';
    execute 'create policy "Admins manage system rules" on public.system_rules for all to authenticated using (public.is_admin()) with check (public.is_admin())';
  end if;

  if to_regclass('public.sop_submissions') is not null then
    execute 'alter table public.sop_submissions enable row level security';
    execute 'drop policy if exists "Authenticated read access" on public.sop_submissions';
    execute 'drop policy if exists "Authenticated write access" on public.sop_submissions';
    execute 'drop policy if exists "Users read own sop submissions" on public.sop_submissions';
    execute 'drop policy if exists "Users manage own sop submissions" on public.sop_submissions';
    execute 'create policy "Users read own sop submissions" on public.sop_submissions for select to authenticated using (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text))';
    execute 'create policy "Users manage own sop submissions" on public.sop_submissions for all to authenticated using (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text)) with check (public.is_admin() or (public.is_approved() and "userId" = auth.uid()::text))';
  end if;
end;
$$;
