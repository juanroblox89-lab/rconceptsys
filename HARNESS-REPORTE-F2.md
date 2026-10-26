# REPORTE DE EJECUCIÓN: FASE F2 - PARTE A

**Fecha de ejecución:** 2026-10-25 / 2026-10-26  
**Worktree:** `C:\Users\USUARIO\Desktop\jestalvz\proyectos\rconceptsys-f2`  
**Rama activa:** `f2-trabajos` (basada en `desde-cero`)  
**Alcance:** **SOLO PARTE A** (Migración 003, Backend Go: Store + Endpoints + Tests unitarios/concurrencia, Documentación de API).  
**Reglas duras respetadas:**
- No se tocaron `app/`, `components/`, estilos CSS ni `.env*`.
- No se aplicó SQL directamente a producción de Supabase (queda a cargo del director Claude).
- Se validó la sintaxis e idempotencia de la migración 003 con PGlite en un directorio temporal fuera del repositorio, sin alterar el `package.json`.
- No se realizaron deploys ni `git push`. Commits locales atómicos y ordenados.
- Todo en español neutro, sin emojis, con manejo de errores humano.

---

## 1. Resumen de Implementación

### 1.1 Migración `supabase/migrations/003_trabajos_tareas_facturas.sql`
- **Tablas creadas:**
  - `public.tipos_trabajo`: catálogo configurable de trabajos (`clave` única, `nombre`, `rol_id` FK nullable, `precio` entero en pesos COP >= 0 y <= 100M, `activo`, `orden`, `creado_en`). Semilla inicial: `grabacion_video` (Camarógrafo), `edicion_video` (Editor), `subida_video` (Subidor de contenido) con precio 0.
  - `public.facturas`: facturación individual por perfil (`perfil_id`, `estado` check 'abierta'|'pagada', `creada_en`, `pagada_en`, `pagada_por`). Restricción de unicidad parcial: índice `idx_facturas_una_abierta_por_perfil` garantiza **una sola factura abierta** por persona.
  - `public.tareas`: ciclo de vida completo (`tipo_id`, `titulo` 1-120 chars, `descripcion` <= 1000 chars, `asignado_a`, `creado_por`, `estado` check 'pendiente'|'hecha'|'aceptada'|'rechazada'|'cancelada', `fecha_limite`, `nota_persona` <= 500 chars, `motivo_rechazo` <= 500 chars, `precio_congelado` >= 0, `factura_id` FK a facturas, `creada_en`, `hecha_en`, `resuelta_en`, `resuelta_por`). Check `ck_tareas_aceptada_datos` asegura que las tareas aceptadas posean `precio_congelado` y `factura_id` no nulos.
- **Seguridad RLS:** RLS habilitado en las tres tablas. Políticas SELECT restringidas a miembros aprobados (miembros solo leen sus tareas asignadas y sus propias facturas; administradores tienen visibilidad global). Permisos de mutación revocados para `anon` y `authenticated` (toda escritura pasa por el backend con `service_role`).
- **Función atómica `public.aceptar_tarea(p_tarea bigint, p_admin uuid)`:**
  - `SECURITY DEFINER` con `search_path = public`.
  - Permisos revocados de `public`, `anon`, `authenticated`; concedidos exclusivamente a `service_role`.
  - Bloquea la tarea con `FOR UPDATE`, valida estado `hecha`, recupera el precio vigente del `tipo_trabajo`, bloquea/obtiene o crea la factura abierta de la persona asignada y congela el precio en una sola transacción atómica, previniendo condiciones de carrera.

### 1.2 Store Go (`backend/internal/store/`)
- **`store.go`:** Ampliación de la interfaz `Store` con operaciones para tipos de trabajo, tareas y facturas. Modelos `TipoTrabajo`, `Tarea`, `Factura`, `ResumenFacturasPersona` y `FiltroTareas`.
- **`memory.go`:** Implementación en memoria completa protegida con mutex para tests y entorno local/demo. Métodos de creación, actualización, aceptación atómica, rechazo con motivo, cancelación, conteo de tareas por revisar y resumen de facturación con sumatorias de totales.
- **`supa/store.go` & `supa/client.go`:** Implementación sobre la REST API de Supabase y soporte para RPC (`POST /rest/v1/rpc/aceptar_tarea`). Carga y cálculo de totales de facturas a partir de líneas congeladas.

### 1.3 Endpoints HTTP (`backend/internal/httpapi/handlers.go`)
- **Miembros aprobados:**
  - `GET /api/trabajos`: Lista trabajos activos con roles y precios.
  - `GET /api/tareas?estado=`: Lista las tareas asignadas al usuario actual con filtro opcional por estado.
  - `POST /api/tareas/{id}/hecha`: Permite al asignado marcar la tarea como hecha con nota opcional (solo desde `pendiente` o `rechazada`).
  - `GET /api/facturas/mia`: Retorna la factura abierta actual con sus líneas y total acumulado, más el historial de facturas pagadas.
- **Administrador (`es_admin: true`):**
  - `GET /api/admin/trabajos`: Catálogo completo de trabajos.
  - `POST /api/admin/trabajos`: Crear nuevo trabajo.
  - `PATCH /api/admin/trabajos/{id}`: Actualización parcial de nombre, precio, rol, estado activo u orden.
  - `GET /api/admin/tareas?estado=&persona=`: Listado de tareas con filtro y contador de `por_revisar`.
  - `POST /api/admin/tareas`: Creación de tarea con validación de estado aprobado y validación de coincidencia de rol (responde `422 Unprocessable Entity` si la persona no tiene el rol, salvo que el admin envíe `forzar: true`).
  - `POST /api/admin/tareas/{id}/aceptar`: Aceptación atómica y congelamiento de precio en factura abierta.
  - `POST /api/admin/tareas/{id}/rechazar`: Rechazo con `{motivo}` obligatorio (hasta 500 caracteres).
  - `POST /api/admin/tareas/{id}/cancelar`: Cancelación de tareas pendientes o rechazadas.
  - `GET /api/admin/facturas`: Resumen de facturación de todo el equipo por persona (abiertas, totales pendientes y pagadas).
  - `GET /api/admin/facturas/{id}`: Detalle de factura específica.
  - `POST /api/admin/facturas/{id}/pagar`: Cierre y pago de factura abierta.

### 1.4 Pruebas y Validación (`backend/internal/httpapi/f2_test.go`)
Se implementaron 8 suites de pruebas exhaustivas:
1. `TestF2CicloCompletoTareaYFactura`: Ciclo completo crear → hecha → aceptada → factura abierta con línea y total.
2. `TestF2RechazoYReenvio`: Rechazo con validación de motivo obligatorio, reenvío por la persona y aceptación posterior.
3. `TestF2PrecioCongeladoInmutable`: Modificación del precio del trabajo después de aceptada una tarea; verificación de que el monto en factura permanece inalterado.
4. `TestF2PagarFacturaYAbrirNueva`: Pago de factura abierta y verificación de que la siguiente tarea aceptada abre automáticamente una nueva factura.
5. `TestF2PermisosYPrivacidad`: Verificación estricta de que miembros no ven tareas de otros (404 seguro al intentar mutar tareas ajenas), miembros suspendidos reciben 403 y no administradores reciben 403 en rutas de admin.
6. `TestF2ValidacionRolesYForzar`: Validación de rol con respuesta 422 y omisión permitida mediante `forzar: true`.
7. `TestF2AceptarConcurrenteGoroutines`: Ejecución concurrente con goroutines intentando aceptar la misma tarea; exactamente una petición triunfa y no se generan líneas duplicadas.
8. `TestF2CancelarTarea`: Cancelación administrativa y bloqueo de entrega para tareas canceladas.

---

## 2. Resultados de Verificación

- **Compilación Go:** `go build ./...` en `backend/` -> Limpio, sin errores.
- **Go Vet:** `go vet ./...` en `backend/` -> Limpio, sin advertencias.
- **Go Test:** `go test -v ./...` en `backend/` -> **PASS** en todos los paquetes (`httpapi`, `store`).
- **Idempotencia SQL:** Validada aplicando `003_trabajos_tareas_facturas.sql` dos veces consecutivas en PGlite (PostgreSQL 15+ WASM).

---

## 3. Hashes de Git (Commits de la Fase F2 - Parte A)

| Hash | Mensaje |
|---|---|
| `fc006e1` | `feat(f2): migración 003` |
| `10d2b85` | `feat(f2): store y endpoints` |
| `9fc5c85` | `test(f2): ciclo completo, rechazo, precio congelado, facturas y concurrencia` |
| `acf99e8` | `docs(f2): documentación completa de endpoints F2` |

---

## 4. ESTADO PARA RETOMAR

1. **Base de Datos:**
   - La migración `supabase/migrations/003_trabajos_tareas_facturas.sql` está escrita, validada como idempotente y commiteada.
   - **Acción requerida por Claude (director):** Revisar y aplicar la migración 003 al proyecto de Supabase cuando sea oportuno.
2. **Backend:**
   - Listo y verificado. Expone todas las rutas especificadas en el Brief F2 bajo `/api/*` y `/api/admin/*`.
3. **Frontend (PARTE B):**
   - Pendiente para cuando la sesión F1 termine el rediseño y se fusione la rama principal.
   - El frontend podrá consumir directamente los contratos documentados en `docs/API-F2.md`.
4. **Archivos clave entregados:**
   - `supabase/migrations/003_trabajos_tareas_facturas.sql`
   - `backend/internal/store/store.go`
   - `backend/internal/store/memory.go`
   - `backend/internal/supa/store.go`
   - `backend/internal/supa/client.go`
   - `backend/internal/httpapi/handlers.go`
   - `backend/internal/httpapi/f2_test.go`
   - `docs/API-F2.md`
   - `HARNESS-REPORTE-F2.md`

---

FASE-F2-A TERMINADA
