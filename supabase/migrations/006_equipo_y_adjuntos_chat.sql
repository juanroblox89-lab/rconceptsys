-- 006_equipo_y_adjuntos_chat.sql
-- F5: barra derecha "Equipo" (configuración en public.configuracion) y adjuntos del chat
-- Creado para Supabase (Postgres 15+)
--
-- Orden de migraciones F5: 006 → 007 → 008 → 009 → 010 → 011

-- 1. Configuración del equipo
-- Se guarda en la tabla clave/valor que ya existía (public.configuracion).
-- valor = { "nombre": text, "descripcion": text, "enlaces": [{id,nombre,url,orden,creado_en}] }
insert into public.configuracion (clave, valor)
values (
    'equipo',
    jsonb_build_object(
        'nombre', 'RConcept Systems',
        'descripcion', 'Producción de contenido para clientes: grabación, edición y publicación.',
        'enlaces', '[]'::jsonb
    )
)
on conflict (clave) do nothing;

comment on column public.configuracion.valor is
    'Configuración en jsonb. La clave "equipo" guarda nombre, descripción y enlaces rápidos de la barra derecha (F5).';

-- 2. Adjuntos del chat (imágenes, videos, audios, archivos y carpetas de Drive)
create table if not exists public.chat_adjuntos (
    id bigint generated always as identity primary key,
    mensaje_id bigint references public.chat_mensajes(id) on delete cascade,
    autor_id uuid not null references public.perfiles(id) on delete cascade,
    tipo text not null check (tipo in ('imagen', 'video', 'audio', 'archivo', 'drive')),
    nombre text not null check (char_length(nombre) between 1 and 200),
    mime text not null default '' check (char_length(mime) <= 120),
    tamano bigint not null default 0 check (tamano >= 0),
    duracion_seg integer check (duracion_seg is null or (duracion_seg >= 0 and duracion_seg <= 3600)),
    ancho integer,
    alto integer,
    storage_path text,
    url_externa text check (url_externa is null or char_length(url_externa) <= 800),
    creado_en timestamptz not null default now(),
    -- Un adjunto suelto (sin mensaje) es un archivo subido y todavía no enviado.
    constraint ck_chat_adjuntos_origen check (storage_path is not null or url_externa is not null)
);

create index if not exists idx_chat_adjuntos_mensaje on public.chat_adjuntos(mensaje_id);
create index if not exists idx_chat_adjuntos_autor on public.chat_adjuntos(autor_id);
create index if not exists idx_chat_adjuntos_sueltos on public.chat_adjuntos(creado_en)
    where mensaje_id is null;

alter table public.chat_adjuntos enable row level security;

-- Lectura: los adjuntos de mensajes visibles para miembros aprobados.
drop policy if exists "chat_adjuntos_select_miembros" on public.chat_adjuntos;
create policy "chat_adjuntos_select_miembros"
    on public.chat_adjuntos
    for select
    to authenticated
    using (public.es_miembro() and mensaje_id is not null);

revoke all on public.chat_adjuntos from anon;
revoke insert, update, delete, truncate, references, trigger on public.chat_adjuntos from authenticated;

-- 3. Mensajes sin texto: un mensaje puede llevar solo adjuntos.
alter table public.chat_mensajes drop constraint if exists chat_mensajes_cuerpo_check;
alter table public.chat_mensajes
    add constraint chat_mensajes_cuerpo_check
    check (char_length(cuerpo) <= 2000);

comment on column public.chat_mensajes.cuerpo is
    'Texto del mensaje (0 a 2000 caracteres). Puede ir vacío si el mensaje lleva solo adjuntos (F5).';

-- 4. Storage: bucket para los adjuntos livianos del chat.
-- Los videos pesados no se suben aquí: se comparten como carpeta de Drive.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'chat',
    'chat',
    false,
    20971520, -- 20 MB
    array[
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
        'video/mp4', 'video/webm', 'video/quicktime',
        'application/pdf', 'application/zip', 'text/plain', 'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
    ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520;

-- El bucket es privado: solo el backend (service_role) sube y descarga.
drop policy if exists "chat_lectura_miembros" on storage.objects;
create policy "chat_lectura_miembros"
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'chat' and public.es_miembro());
