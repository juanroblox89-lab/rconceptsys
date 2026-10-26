# REPORTE DE EJECUCIÓN: FASE F3 - PARTE A

**Fecha de ejecución:** 2026-10-26  
**Repositorio:** `C:\Users\USUARIO\Desktop\jestalvz\proyectos\rconceptsys`  
**Rama activa:** `desde-cero`  
**Alcance:** **SOLO PARTE A** (Migración 004, Modelos, Store Go en memoria y Supabase, Endpoints HTTP F3, Tests Go exhaustivos, Documentación en `docs/API-F3.md` y Recompilación de `_qa/rc-api.exe`).  
**Reglas duras respetadas:**
- No se tocaron `.env*`, `Sensible\`, ni las migraciones 001 a 003.
- No se aplicó SQL directamente a Supabase (lo revisa y aplica el director Claude entre la Parte A y la Parte B).
- No se realizaron deploys ni `git push`.
- Commits locales por partes, ordenados, con el autor configurado (`Juan <juanroblox89@gmail.com>`), sin force-push, reset ni stash.
- No se crearon worktrees ni junctions de `node_modules` (evitando roturas en Turbopack).
- Fechas siempre en zona horaria **America/Bogota** (UTC-5, sin horario de verano).
- Todo en español neutro, sin emojis y con mensajes de error humanos.

---

## 1. Resumen de Implementación

### 1.1 Migración `supabase/migrations/004_minutos_clientes_estadisticas.sql`
- **Idempotente y segura:** Utiliza bloques `DO $$ ... $$` con validaciones de existencia en `information_schema` y `drop ... if exists`.
- **`tipos_trabajo`:**
  - Nueva columna `unidad text not null default 'trabajo' check (unidad in ('trabajo', 'minuto'))`.
  - Actualización automática de la semilla: `grabacion_video` pasa a `unidad = 'minuto'`.
- **`clientes`:**
  - Nueva tabla `public.clientes(id serial primary key, nombre text not null, activo boolean not null default true, creado_en timestamptz not null default now())`.
  - Restricción de longitud: `char_length(trim(nombre)) >= 1 and char_length(nombre) <= 80`.
  - Índice único insensible a mayúsculas: `idx_clientes_nombre_lower on public.clientes(lower(nombre))`.
  - RLS activado: política `clientes_select_miembros` para lectura exclusiva de miembros aprobados; mutaciones directas revocadas para `anon` y `authenticated` (toda mutación pasa por backend con `service_role`).
- **`tareas`:**
  - `cliente_id integer references public.clientes(id) on delete set null` con índice `idx_tareas_cliente`.
  - `cantidad integer null check (cantidad is null or (cantidad between 1 and 1440))` (minutos reportados por la persona).
  - `cantidad_aceptada integer null check (cantidad_aceptada is null or (cantidad_aceptada between 1 and 1440))` (minutos congelados por admin).
  - `precio_unitario_congelado bigint null check (precio_unitario_congelado is null or (precio_unitario_congelado >= 0 and precio_unitario_congelado <= 100000000000))`.
  - `precio_congelado` elevado a tipo `bigint` con check de tope `100000000000`.
  - Restricción `ck_tareas_aceptada_datos` actualizada: exige que una tarea `aceptada` tenga `precio_congelado`, `precio_unitario_congelado`, `cantidad_aceptada` y `factura_id` no nulos.
- **Función atómica `public.aceptar_tarea(p_tarea bigint, p_admin uuid, p_cantidad integer default null)`:**
  - Reemplaza de forma segura la función anterior. Ejecución revocada para `anon` y `authenticated`; concedida únicamente a `service_role`.
  - Si el tipo es `'minuto'`, toma `coalesce(p_cantidad, tareas.cantidad)` verificando rango 1 a 1440; si es `'trabajo'`, fija cantidad en 1.
  - Calcula `total = (precio_vigente::bigint) * (cantidad::bigint)`.
  - Bloquea/abre la factura abierta de la persona asignada de forma atómica y congela precio unitario, cantidad aceptada, total y factura en una sola transacción.

### 1.2 Store Go (`backend/internal/store/`)
- **Modelos e Interfaces (`store.go`):**
  - Incorporación de `Cliente`, `TipoTrabajo.Unidad`, campos de minutos y cantidades en `Tarea`, y ampliación a `int64` en acumulados de facturas y estadísticas.
  - Modelos de estadísticas: `EstadisticasYoResponse`, `EstadisticasAdminResponse`, `TotalesAdmin`, `PuntoSerieAdmin`, `ItemPersonaEstadistica`, `ItemClienteEstadistica`, `ItemTipoEstadistica`.
  - Nuevas operaciones en interfaz `Store`: `ListarClientes`, `ObtenerClientePorID`, `CrearCliente`, `ActualizarCliente`, `MarcarTareaHecha` (con `cantidad`), `AceptarTarea` (con `cantidad` opcional), `ObtenerEstadisticasYo` y `ObtenerEstadisticasAdmin`.
- **Agregador de Estadísticas (`estadisticas.go`):**
  - Módulo desacoplado y compartido entre memoria y Supabase.
  - Zona horaria `America/Bogota` (UTC-5) con respaldo seguro `time.FixedZone` y `_ "time/tzdata"`.
  - Funciones auxiliares de cortes de fecha: `InicioDiaBogota`, `FinDiaBogota` (23:59:59.999), `InicioSemanaBogota` (lunes), `InicioMesBogota`.
  - `CalcularEstadisticasYo`: calcula rango solicitado, `este_mes` y `total` histórico sin requerir múltiples llamadas. Desglose por tipo ordenado por trabajos desc (empate por valor).
  - `CalcularEstadisticasAdmin`: calcula totales, serie temporal continua rellenando huecos en 0 (`dia`, `semana`, `mes`), listas ordenadas por trabajos y valor (`por_persona`, `por_cliente` con agrupación "Sin cliente", `por_tipo`), límite de 20 elementos con indicador `hay_mas` y filtros combinables (`persona_id`, `cliente_id`, `tipo_id`).
- **Memoria (`memory.go`):**
  - Soporte completo para clientes (validación de nombre 1-80 chars, unicidad `EqualFold`).
  - Validación de minutos al entregar tarea por minuto (obligatorio 1-1440; ignorado en tipo por trabajo).
  - Aceptación con corrección opcional de minutos por admin.
  - Inmutabilidad de precios congelados ante cambios posteriores de precio o unidad.
- **Supabase (`supa/store.go`):**
  - Mapeo de columnas y relaciones REST PostgREST (`clientes(*)`, `tipos_trabajo(*)`, `roles(*)`).
  - Llamada RPC a `aceptar_tarea` enviando `p_cantidad` opcional.
  - Consultas paginadas (`limit: 1000`, `offset`) para cálculo de estadísticas de gran volumen.

### 1.3 Endpoints HTTP (`backend/internal/httpapi/handlers.go`)
- **Miembros Aprobados:**
  - `GET /api/clientes`: Lista clientes activos alfabéticamente.
  - `GET /api/yo/estadisticas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: Retorna estadísticas personales del miembro, siempre incluyendo `este_mes` y `total`.
  - `POST /api/tareas/{id}/hecha`: Exige `cantidad` (1-1440) si el tipo es por minuto; ignora cantidad si es por trabajo.
  - `GET /api/facturas/mia`: Retorna factura con líneas detalladas (precio unitario, cantidad aceptada y total congelado en `int64`).
- **Administrador:**
  - `GET /api/admin/clientes`: Lista completa de clientes (activos e inactivos).
  - `POST /api/admin/clientes`: Crea cliente con validación 1-80 caracteres y rechazo de duplicados (409 Conflict).
  - `PATCH /api/admin/clientes/{id}`: Edición parcial (nombre, activo).
  - `POST /api/admin/trabajos`: Acepta campo opcional `unidad` (`trabajo` o `minuto`, por defecto `trabajo`).
  - `PATCH /api/admin/trabajos/{id}`: Acepta actualización de `unidad`.
  - `POST /api/admin/tareas`: Acepta `cliente_id` opcional (valida existencia y estado activo; 400 si inactivo o inexistente).
  - `POST /api/admin/tareas/{id}/aceptar`: Acepta `{cantidad?}` opcional para corregir minutos grabados antes de congelar.
  - `GET /api/admin/estadisticas?desde&hasta&agrupar=dia|semana|mes`: Genera reporte integral con serie continua con huecos en 0, desglose por personas (excluyendo admins), por clientes (con "Sin cliente") y por tipos. Validación de rango `<= 5 años`, `desde <= hasta` y zona Bogotá.
- **Documentación de API:**
  - Archivo `docs/API-F3.md` con especificación de formatos, ejemplos de request/response y códigos de error humanos.

---

## 2. Evidencia de Pruebas y Verificación

### 2.1 Cobertura de Tests Unitarios y de Integración (`backend/internal/httpapi/f3_test.go`)
Se implementaron 9 suites de pruebas específicas para F3:
1. `TestF3CobroPorMinuto`: Cálculo `precio × minutos` (1.500 COP × 120 min = 180.000 COP), rechazo por falta de minutos (400), rechazo por minutos fuera de rango (0 o 1500) y reflejo en factura abierta.
2. `TestF3CorreccionMinutosAdmin`: Corrección de minutos por el admin al aceptar (de 100 reportados a 90 corregidos -> 135.000 COP) y rechazo de corrección inválida.
3. `TestF3TipoPorTrabajoIgnoraCantidad`: Una tarea por trabajo (`edicion_video`) ignora la cantidad reportada por el usuario y fija `cantidad_aceptada: 1` al ser aceptada por admin.
4. `TestF3PrecioCongeladoInmutable`: Modificación del precio y unidad de `grabacion_video` posterior a la aceptación no altera los valores congelados de la tarea ni de la factura.
5. `TestF3ClientesCRUDYValidaciones`: Creación de cliente, rechazo por nombre duplicado insensible a mayúsculas (409), desactivación de cliente, exclusión para miembros y visibilidad para admin, rechazo al asignar tarea con cliente inactivo y asignación exitosa con cliente activo.
6. `TestF3EstadisticasYo`: Consulta de estadísticas del miembro autenticado, aislamiento entre personas (no ve tareas de otros) y cálculo automático de `este_mes` y `total`.
7. `TestF3EstadisticasAdmin`: Verificación de permisos (miembro no admin recibe 403 Forbidden), cálculo de totales (`trabajos`, `minutos`, `valor`, `personas`, `clientes`), serie continua de 5 días con huecos rellenados en 0, desglose por cliente con grupo `"Sin cliente"` y filtros combinados (`cliente_id`, `sin_cliente`).
8. `TestF3ZonaBogotaBordeFecha`: Tarea aceptada a las 23:30 hora de Bogotá (que en UTC corresponde a las 04:30 del día siguiente) se computa en el día correcto de Bogotá, se incluye en el rango `hasta = 2026-10-26` y no computa en el día siguiente.
9. `TestF3ValidacionRangosFecha`: Validación de `desde > hasta` (400), formato de fecha no ISO (400), rango superior a 5 años (400) tanto en admin como en yo/estadisticas.

### 2.2 Resultados de los Comandos de Verificación
- `go vet ./...` en `backend/`: **PASS** (completamente limpio, sin advertencias).
- `go test -v ./...` en `backend/`: **PASS** (todas las pruebas de `httpapi` y `store` pasando al 100%).
- Recompilación de binario local: `go build -o ..\_qa\rc-api.exe .\cmd\server` ejecutado exitosamente (`_qa/rc-api.exe` actualizado con tamaño 11.77 MB).

---

## 3. Hashes de Git (Commits de Fase F3 - Parte A)

| Hash | Mensaje de Commit |
|---|---|
| `f461b54` | `feat(f3): migración 004 minutos, clientes y campos de congelacion` |
| `a5ea1ef` | `feat(f3): modelos, memoria y agregaciones de estadisticas en store` |
| `3065012` | `feat(f3): soporte de clientes, minutos y estadisticas en supa store` |
| `4eb4c59` | `feat(f3): endpoints HTTP para unidad en trabajos, clientes CRUD, tareas con minutos y estadisticas` |
| `0e39403` | `docs(f3): documentacion de endpoints API F3` |
| `87fc55e` | `test(f3): tests exhaustivos para cobro por minuto, clientes, congelacion y estadisticas` |

---

## 4. ESTADO PARA RETOMAR

1. **Migración SQL lista para aplicar por el director:**
   - Archivo: `supabase/migrations/004_minutos_clientes_estadisticas.sql`.
   - Idempotente y probada conceptualmente contra el esquema existente.
   - Debe ejecutarse en Supabase antes de iniciar las pruebas de la PARTE B.
2. **Backend Go:**
   - Listo y verificado con tests automatizados.
   - Binario `_qa/rc-api.exe` recompilado y listo para ser utilizado por los scripts de prueba `run_rc.mjs` y E2E.
3. **Siguiente fase (PARTE B - Frontend):**
   - UI de Trabajos: selector de unidad "Se cobra por" (Trabajo / Minuto) y etiqueta COP correspondiente.
   - Pestaña Clientes en Gestión: lista, agregar, renombrar, activar/desactivar.
   - Nueva Tarea: selector de cliente destacado con modal para crear cliente al vuelo.
   - Mis Tareas: modal para ingresar minutos grabados obligatorios en tareas de grabación.
   - Admin Por Revisar: visualización y corrección opcional de minutos antes de aceptar.
   - Mi Factura: desglose "X min × $ Y = $ Z".
   - Mi Perfil: tarjeta "Trabajos hechos" con Total, Este mes, presets de rango y desglose por tipo.
   - Gestión > Estadísticas: panel administrativo con presets de fechas, tarjetas de métricas, gráfica de línea interactiva SVG y gráficos de barras horizontales ("Más trabajos por persona", "Más trabajos por cliente", "Por tipo de trabajo").

---

FASE-F3-A TERMINADA
