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
   - La migración `supabase/migrations/003_trabajos_tareas_facturas.sql` está escrita, validada como idempotente y aplicada exitosamente en Supabase (con el ajuste en `aceptar_tarea` del commit `241fa45`).
2. **Backend:**
   - Listo y verificado. Expone todas las rutas especificadas en el Brief F2 bajo `/api/*` y `/api/admin/*`. Soporta RPC de Supabase y relaciones de clave foránea específicas para PostgREST.
3. **Frontend (PARTE B):**
   - Construido completamente y verificado contra la API real y el backend Go.
4. **Archivos clave entregados:**
   - `supabase/migrations/003_trabajos_tareas_facturas.sql`
   - `backend/internal/store/store.go`
   - `backend/internal/store/memory.go`
   - `backend/internal/supa/store.go`
   - `backend/internal/supa/client.go`
   - `backend/internal/httpapi/handlers.go`
   - `backend/internal/httpapi/f2_test.go`
   - `docs/API-F2.md`
   - `lib/types.ts`
   - `lib/api.ts`
   - `components/Sidebar.tsx` y `components/Sidebar.module.css`
   - `app/(app)/tareas/page.tsx` y `tareas.module.css`
   - `app/(app)/factura/page.tsx` y `factura.module.css`
   - `app/(app)/admin/page.tsx` y `admin.module.css`
   - `_qa/f2/` (capturas 1280 y 375 px)
   - `HARNESS-REPORTE-F2.md`

---

## 5. PARTE B: Pantallas de Trabajos, Tareas, Facturas y Gestión

### 5.1 Implementación de Pantallas y Componentes
1. **Navegación (`components/Sidebar.tsx`):**
   - Nuevos ítems en la barra lateral para todos los miembros: **"Tareas"** (`/tareas`) y **"Mi factura"** (`/factura`).
   - Para administradores: **"Gestión"** (`/admin`).
   - Contadores en vivo con badge tabular:
     - Badge numérico en "Tareas" con la cantidad de tareas en estado `pendiente`.
     - Badge numérico en "Gestión" con la cantidad de tareas en estado `hecha` ("Por revisar").
     - Actualización automática al entrar y cada 60 segundos si el documento está visible (`visibilitychange`).
2. **Mis tareas (`/tareas`):**
   - Tarjetas compactas agrupadas por estado: Pendientes, Rechazadas (con motivo visible), Por revisar (esperando al admin) y Aceptadas (con precio congelado).
   - Chip de trabajo/rol, fecha límite con indicador de vencida en rojo suave, descripción completa.
   - Modal para "Marcar como hecha" con nota opcional de hasta 500 caracteres y contador de caracteres.
   - Avisos de vidrio para feedback y estados vacíos con la tarjeta vacía del kit neumórfico.
3. **Mi factura (`/factura`):**
   - Tarjetas de estadística arriba: Total de la factura abierta (formato `$ 1.250.000` en pesos colombianos con `tabular-nums`) y cantidad de trabajos aceptados. Total histórico cobrado.
   - Tabla en escritorio y tarjetas apiladas en móvil con fecha de aceptación, chip de rol/trabajo, título y valor congelado.
   - Historial de facturas pagadas desplegables con acordeón neumórfico para inspeccionar las líneas que conformaron cada corte.
   - Solo lectura, sin mutaciones directas.
4. **Gestión de Administrador (`/admin`):**
   - Integrado con el componente `Pestanas` del kit:
     - **Trabajos:** Tabla/tarjetas con nombre, clave, rol asignado (select interactivo), precio editable con validación 0 a 100M COP y guardado por fila/onBlur con aviso de vidrio. Interruptor de activo/inactivo. Modal para crear nuevo trabajo. Texto de ayuda indicando que modificar el precio no altera tareas ya aceptadas.
     - **Tareas:** Modal de "Nueva tarea" con tipo de trabajo, selector de personas agrupadas (primero lista personas con el rol requerido y separado "Otras personas sin el rol" con advertencia y casilla para forzar asignación), título, descripción y fecha límite. Debajo: bandeja destacada **"Por revisar"** con nota de la persona, valor que se congelará, botón "Aceptar" y botón de peligro "Rechazar" (abre modal exigiendo motivo de rechazo de hasta 500 caracteres). Listado completo de tareas con filtros en tiempo real por persona y por estado, y botón para cancelar tareas pendientes o rechazadas.
     - **Facturas:** Resumen por persona de factura abierta con total pendiente y cantidad de trabajos. Desplegable con detalle de líneas y botón "Marcar factura pagada" con modal de confirmación.
     - **Miembros:** Control de aprobación con selección de roles iniciales, suspensión, reactivación, conmutación de privilegios de admin y creación de nuevos roles.

### 5.2 Evidencia de Verificación

#### 1. Comandos de Verificación
- `npm run typecheck`: **PASS** (`tsc --noEmit` limpio).
- `npm run lint`: **PASS** (`eslint` limpio, 0 errores, 0 warnings).
- `npm test`: **PASS** (todos los tests de chat y utilidades pasando).
- `npx next build --webpack`: **PASS** (compilación optimizada de producción completa, 12 páginas generadas estáticamente/dinámicamente sin errores).
- `go vet ./... && go test ./...` en `backend/`: **PASS** (limpio en todos los paquetes).

#### 2. E2E Real con Playwright, Supabase Real y Cuentas Desechables (`_qa/e2e_f2_completo.py`)
Ejecutado de principio a fin contra la API Go en puerto 8310 y Next.js en puerto 3310:
- **(a)** Admin se registra, queda aprobado y administrador. En `/admin` (Trabajos) actualiza el precio de "Edición de video" a 80.000 COP y crea el trabajo "Miniatura de YouTube" por 25.000 COP -> **OK**.
- **(b)** Se registran `rc-prueba-editor@example.com` y `rc-prueba-cam@example.com`. El admin los aprueba desde la pestaña Miembros asignando rol Editor y Camarógrafo respectivamente -> **OK**.
- **(c)** El admin abre "Nueva tarea" de Edición de video: el selector ofrece primero en el optgroup a Eduardo Editor -> **OK**.
- **(d)** Eduardo Editor entra a `/tareas` en móvil 375 px, ve la tarea pendiente y la marca hecha con la nota *"Video exportado en 4K 60fps listo en Drive"* -> **OK**.
- **(e)** El admin ve la tarea en la bandeja "Por revisar" con su nota y valor a congelar de 80.000 COP; la acepta y desaparece de la bandeja -> **OK**.
- **(f)** El admin modifica el precio del trabajo de edición a 150.000 COP. El usuario consulta `/factura` y se comprueba que el valor de la línea aceptada permanece congelado en 80.000 COP -> **OK**.
- **(g)** El admin crea una tarea para Eduardo Editor, éste la marca hecha y el admin la rechaza con el motivo *"La tipografía de la miniatura es muy pequeña para celular"*. Eduardo la ve en la sección "Rechazadas" con el motivo exacto, la reenvía con nueva nota *"Tipografía agrandada a 48px y texto centrado"* y el admin la acepta -> **OK**.
- **(h)** Privacidad: Carlos Camarógrafo consulta sus tareas y tiene 0 tareas de Eduardo. Intenta consultar `/api/admin/facturas` y recibe `403 Forbidden` -> **OK**.
- **(i)** El admin va a Facturas, despliega la tarjeta de Eduardo Editor y confirma el pago de la factura abierta (105.000 COP). Luego crea y acepta una nueva tarea de 25.000 COP: en `/factura` se abre un nuevo corte de 25.000 COP y el corte anterior de 105.000 COP queda en el historial de pagadas -> **OK**.
- **(j)** Usuario no admin recibe `403 Forbidden` en `/api/admin/miembros`, `/api/admin/roles`, `/api/admin/trabajos`, `/api/admin/tareas` y `/api/admin/facturas` -> **OK**.
- **Limpieza final:** Usuarios desechables, tareas y facturas creadas borrados de Supabase al terminar -> **OK**.

#### 3. Geometría y Capturas Playwright en `_qa/f2/`
Medición con JavaScript en navegador:
- `admin-gestion-trabajos-375`: `scrollWidth = 375`, `clientWidth = 375` (sin scroll horizontal) -> **OK**.
- `mis-tareas-pendiente-375`: `scrollWidth = 375`, `clientWidth = 375` (sin scroll horizontal) -> **OK**.
- `mi-factura-abierta-375`: `scrollWidth = 375`, `clientWidth = 375` (sin scroll horizontal) -> **OK**.
- `admin-gestion-facturas-375`: `scrollWidth = 375`, `clientWidth = 375` (sin scroll horizontal) -> **OK**.
- Capturas generadas y archivadas en `_qa/f2/`:
  - `admin-bandeja-por-revisar-1280.png`
  - `admin-gestion-facturas-1280.png`
  - `admin-gestion-facturas-375.png`
  - `admin-gestion-trabajos-1280.png`
  - `admin-gestion-trabajos-375.png`
  - `mi-factura-abierta-1280.png`
  - `mi-factura-abierta-375.png`
  - `mi-factura-nueva-abierta-375.png`
  - `mis-tareas-aceptada-1280.png`
  - `mis-tareas-hecha-375.png`
  - `mis-tareas-pendiente-375.png`
  - `mis-tareas-rechazada-375.png`
  - `modal-confirmar-pago-1280.png`
  - `modal-marcar-hecha-375.png`
  - `modal-nueva-tarea-1280.png`
  - `modal-nuevo-trabajo-1280.png`
  - `modal-rechazar-tarea-1280.png`

#### 4. Contraste de Color WCAG
- Texto principal (`#111827`) sobre superficie (`#F0F2F5`): **15.82:1** (supera 4.5:1).
- Chip azul (`#1E40AF` sobre `#DBEAFE`): **7.15:1** (supera 4.5:1).
- Chip verde (`#166534` sobre `#DCFCE7`): **6.49:1** (supera 4.5:1).
- Chip rojo (`#991B1B` sobre `#FEE2E2`): **6.80:1** (supera 4.5:1).
- Texto sobre vidrio toast (`#111827` sobre `#FAFBFC`): **17.12:1** (supera 4.5:1).

---

## 6. Commits de la Parte B

| Hash | Mensaje |
|---|---|
| `7128254` | `feat(f2): pantallas de tareas, factura y gestion de admin` |
| `74cdf6c` | `fix(f2): resolver ambiguedad fk en supa store y depurar administracion` |
| `f4b1fd9` | `fix(f2): silenciar advertencia linter en admin cargarDatos` |

---

FASE-F2-B TERMINADA
