# BRIEF: Guion opcional al asignar un trabajo

**Reglas duras:** rama `desde-cero`, **sin commit ni push** (Elías revisa y publica), sin tocar `.env*`, `Sensible\`, datos de producción ni secretos. No aplicar SQL contra producción. Máximo 1 servidor local de QA. Sin force-push, reset ni stash. No tocar los otros `BRIEF-*.md` sin seguimiento.

## Contexto
Samuel asigna videos y a veces quiere pasar el guion (texto largo que el editor debe seguir: escenas, locución, textos en pantalla). Hoy solo existe "Especificaciones" (`descripcion`, máx. 1000) en `components/FormularioAsignacion.tsx`. Queremos un campo **Guion** opcional, separado de las especificaciones.

## Qué hacer
1. **Base de datos:** migración idempotente `supabase/migrations/029_guion_tarea.sql`: `alter table public.tareas add column if not exists guion text not null default ''` + `check` de longitud (máx. 20000) creado solo si no existe (bloque DO con `pg_constraint`). Si `tarea_historial` o `tarea_entregas` copian campos de la tarea, revisar si el guion debe viajar también (p. ej. en "Pedir de nuevo" — ver `backend/internal/httpapi/pedido_de_nuevo.go` — el guion SÍ se copia al nuevo trabajo). Revisar RPCs existentes que hagan `insert`/`select` explícitos de columnas de `tareas` (migraciones 013–028) y actualizar los que lo necesiten con `create or replace`. Anotar en `supabase/ORDEN.md`.
2. **Backend Go:** `store.Tarea` (`backend/internal/store/store.go`), `memory.go`, `supa/store.go` (mapeo `dbTarea`), handlers de crear/editar tarea (`handlers.go`, `flujo.go`): aceptar `guion` opcional, recortar espacios, validar longitud (máx. 20000, error humano en español), permitir editarlo mientras el trabajo no esté aceptado/facturado (misma regla que `descripcion`). Que no rompa clientes que no lo envían.
3. **Frontend:**
   - `FormularioAsignacion.tsx`: bajo "Especificaciones", un control "Agregar guion (opcional)" que despliega un `textarea` amplio (autoexpandible, contador de caracteres, pegar texto largo sin cortes). Si ya hay guion (edición), viene desplegado. Respetar el detector de cambios sin guardar (líneas ~55–65).
   - `lib/types.ts` y `lib/api.ts`: tipo y payload.
   - **Vista del trabajador** (`components/PaginaTrabajo.tsx`, `MisTareas.tsx`): si hay guion, mostrar bloque "Guion" con vista previa (primeras ~6 líneas) y botón "Ver completo" (expande) + botón "Copiar guion". Conservar saltos de línea; texto plano escapado (nada de HTML crudo). Si no hay guion, no mostrar nada.
   - Vista admin del trabajo / historial: mostrar el guion igual (solo lectura).
   - Notificación y WhatsApp de asignación: añadir "Incluye guion" en el cuerpo si lo hay (no meter el guion completo en push/WhatsApp).
   - RIA (asistente) y cualquier lugar que resuma tareas: si leen `descripcion`, considerar el guion (resumen breve, no volcado completo).
4. **Revisar impacto en todo:** buscar con `grep` todos los usos de `descripcion` de tareas (Go, TS, SQL, tests, exportes/factura) y decidir caso por caso si el guion aplica. Factura/PDF: no incluir el guion. Listar en el reporte cada lugar revisado y la decisión.
5. **Diseño:** estilo RConcept actual (neumórfico claro/oscuro/Glass), 375 px y 1280 px, nada cortado; textarea legible con textos largos.
6. **Tests:** Go (crear con y sin guion, validación de longitud, pedir de nuevo copia guion) y TS si aplica.
7. Actualizar `docs/arquitectura/flujos.json` y correr `npm run mapa`.

## Verificación obligatoria
`npm run mapa`, `npm run typecheck`, `npm run lint`, `npm test`, `cd backend && go vet ./... && go test -count=1 ./...`. Capturas a 375 y 1280 (claro y oscuro) del formulario con guion y de la vista del trabajador (revisadas por subagente).

## Reporte
En `HARNESS-REPORTE.md`: archivos tocados, lugares revisados y decisión, resultado de cada verificación, migración nueva y "ESTADO PARA RETOMAR".
