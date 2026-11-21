-- F6: el cron de cada minuto lo hace Supabase (Vercel Hobby solo permite cron diario).
-- No ejecutar desde el agente. Antes de aplicar, Juan carga DOS secretos en Vault (una sola vez, en el editor SQL, nunca en el repo):
--   select vault.create_secret('https://TU-DOMINIO-DE-PRODUCCION/api/cron/notificaciones', 'rconcept_cron_url');
--   select vault.create_secret('EL_MISMO_VALOR_DE_CRON_SECRET_EN_VERCEL', 'rconcept_cron_secret');
-- Este archivo no contiene secretos y es idempotente.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.rconcept_llamar_cron_notificaciones()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_secreto text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'rconcept_cron_url' limit 1;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'rconcept_cron_secret' limit 1;
  if v_url is null or v_secreto is null then
    return;
  end if;
  perform net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto),
    timeout_milliseconds := 25000
  );
end;
$$;
revoke all on function public.rconcept_llamar_cron_notificaciones() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rconcept-cron-notificaciones') then
    perform cron.unschedule('rconcept-cron-notificaciones');
  end if;
  perform cron.schedule('rconcept-cron-notificaciones', '* * * * *', 'select public.rconcept_llamar_cron_notificaciones();');
end
$$;
