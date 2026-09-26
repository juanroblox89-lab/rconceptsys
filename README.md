# RConcept Systems — v2 (desde cero)

Sistema interno de producción creativa de Rohlfing Concept. Se rehace desde cero (2026-09-26).
El sistema anterior quedó en el tag `legacy-v1`.

Se conservó:
- `database/sql/` — esquema, políticas RLS y migraciones de la base de datos Supabase en uso (los datos reales viven en Supabase, no en este repo).
- `marca/` — logos e íconos.
- `contenido/formatos-y-hooks.js` — biblioteca de formatos y hooks del sistema anterior.

Nunca subir claves al repo: van en variables de entorno (`.env.local` / Vercel).
