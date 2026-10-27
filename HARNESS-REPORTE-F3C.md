# REPORTE DE EJECUCIÓN: FASE F3C
**Estadísticas individuales de cada persona, visibles para el admin desde su perfil (RConcept Systems)**

- **Fecha:** 2026-10-26
- **Rama:** `desde-cero`
- **Repo:** `C:\Users\USUARIO\Desktop\jestalvz\proyectos\rconceptsys`
- **Autor de commits:** `Juan <juanroblox89@gmail.com>`

---

## 1. Commits Realizados

| Hash | Mensaje |
|---|---|
| `de59fe8` | `feat(backend): agregar calculo de este_mes y total para persona_id en estadisticas admin y tests` |
| `ae4a1e3` | `feat(frontend): crear componente TrabajosHechos reutilizable y refactorizar Mi Perfil` |
| `7f553c0` | `feat(equipo): mostrar TrabajosHechos en /equipo/[id] para admins con enlace a Estadisticas` |
| `7d13fa8` | `feat(admin): soporte de enlaces por persona en graficos de barra y lectura de parametros URL` |

---

## 2. Resumen de Implementación

### 2.1 Backend Go (`backend/`)
- **Ampliación compatible de `/api/admin/estadisticas`**:
  - Al recibir `persona_id`, calcula y devuelve adicionalmente `este_mes` y `total` (`{ trabajos, minutos, valor }`) agregando el histórico completo de esa persona en zona horaria **America/Bogota** (UTC-5), permitiendo alimentar la tarjeta de estadísticas individuales sin consultas extras.
  - Si no se pasa `persona_id`, la respuesta mantiene su estructura original sin roturas.
  - `403 Forbidden` garantizado para miembros no administradores (verificado en test unitario e integración).
  - Documentado en `docs/API-F3.md` y tipos actualizados en `lib/types.ts`.
- **Tests Go (`backend/internal/httpapi/f3_test.go`)**:
  - Prueba de permisos: un miembro no admin recibe `403 Forbidden`.
  - Prueba de estadísticas por persona: admin consulta `camID` y `editorID`, verificando totales, `este_mes`, `total` y desglose por tipo con montos y minutos exactos e independientes.
  - Cobertura completa ejecutada y limpia: `go test -count=1 ./...` PASS.

### 2.2 Componente Reutilizable `TrabajosHechos` (`components/TrabajosHechos.tsx`)
- Extraído de `app/(app)/perfil/page.tsx` hacia un componente independiente y modular:
  - Soporta `modo: { tipo: "yo" } | { tipo: "persona", id: string }`.
  - Para `tipo: "yo"`: invoca `api.getYoEstadisticas(desde, hasta)`.
  - Para `tipo: "persona"`: invoca `api.adminGetEstadisticas({ persona_id, desde, hasta })`.
  - Selector de rangos con presets: **Hoy, 7 días, Este mes, Mes pasado, Este año, Todo y Personalizado**.
  - Tarjetas de resumen rápido (*Este mes* y *Total acumulado*), métricas del rango (*Trabajos*, *Grabación en min*, *Total ganado*) y desglose con barras de progreso neumórficas y chips de unidad (`Por trabajo` / `Por minuto`).
  - Enlace compacto **"Ver en Estadísticas"** con icono `BarChart3` cuando se visualiza en modo persona como admin.
  - Estilos en `components/trabajos-hechos.module.css` usando 100% tokens de diseño `var(--rc-*)`.

### 2.3 Mi Perfil (`app/(app)/perfil/page.tsx`)
- Refactorizado para usar `<TrabajosHechos modo={{ tipo: "yo" }} />`.
- Aspecto visual y comportamiento idénticos al estado previo, con código limpio y sin duplicación.

### 2.4 Detalle de Miembro en Equipo (`app/(app)/equipo/[id]/page.tsx`)
- Si quien navega es admin y la persona visualizada **no** es admin:
  - Renderiza `TrabajosHechos` en modo persona con título `"Trabajos hechos de <nombre>"` y enlace directo a Gestión > Estadísticas.
- Si quien navega es un trabajador normal (no admin):
  - No se renderiza la tarjeta ni se realiza ninguna petición de estadísticas por la red (0 peticiones a `/api/admin/estadisticas`).
- Si la persona visualizada es administrador:
  - No se muestra la tarjeta (los administradores no realizan trabajos).

### 2.5 Gestión > Estadísticas (`app/(app)/admin/page.tsx`)
- Soporte para parámetros de URL al montar: lee `?pestana=estadisticas&persona=<id>`, activando la pestaña y preseleccionando el filtro de la persona en el dropdown.
- En el panel **"Más trabajos por persona"**, los nombres ahora son enlaces clicables hacia `/equipo/<id>`.

---

## 3. Verificación de Reglas de Diseño (`_estilo/kit/DISENO.md`)

Citando las **Reglas de diseño (obligatorias en TODAS las pantallas)** de `_estilo/kit/DISENO.md`:

1. **Regla 1 (El texto se acomoda solo; nada queda debajo de la barra lateral):**
   - Bounding boxes medidos por script Playwright a 1280px con la barra lateral colapsada:
     - Pastilla flotante: `{ x: 12, y: 10, width: 159.5, height: 34 }`.
     - Riel lateral: `{ x: 0, y: 0, width: 64, height: 800 }`.
     - Tarjeta `TrabajosHechos`: `{ x: 492, y: 401, width: 528, height: 220 }`.
     - Superposición detectada: `False`. El contenedor `mainWithRail` reserva 64px a la izquierda y 52px arriba.
2. **Regla 2 (Una sola zona con desplazamiento: `main`):**
   - Verificado con `p_admin_desk.mouse.wheel(0, 300)`. La pantalla responde fluidamente al scroll con rueda sin desbordes.
3. **Regla 3 (Las barras de pestañas no se parten en dos filas):**
   - El selector segmentado de presets se adapta en contenedor hundido neumórfico con `flex-wrap: wrap` y gap parejo.
4. **Regla 4 (Nada cortado ni desbordado a 375 px):**
   - Medición script a 375px:
     - `scrollWidth: 375`, `clientWidth: 375`, `bodyScrollWidth: 375`, `bodyClientWidth: 375`.
     - Ausencia total de scroll horizontal (`scrollWidth == clientWidth`).
5. **Regla 5 (Elementos flotantes no tapan contenido en su posición inicial):**
   - Móvil 375px: Pastilla `{ x: 12, y: 10, width: 159.5, height: 34 }` vs tarjeta `{ top: 400+ }`. Superposición: `False`.
6. **Regla 6 (Medición por script y capturas recortadas):**
   - Evidencia capturada y revisada por subagente visual en `_qa/f3c/`:
     - `01-equipo-detalle-admin-1280.png` (vista escritorio 1280px completa)
     - `02-trabajos-hechos-admin-1280.png` (recorte específico de la tarjeta en escritorio)
     - `03-equipo-detalle-admin-375.png` (vista móvil 375px completa)
     - `04-trabajos-hechos-admin-375.png` (recorte específico de la tarjeta en móvil con datos)

---

## 4. Evidencia de Pruebas Automatizadas y E2E Real

### 4.1 Comandos de Calidad de Código
```
> npm run typecheck
tsc --noEmit (Exit code: 0)

> npx eslint app components lib
(Exit code: 0 - 0 errors, 0 warnings)

> npm test
✔ obtenerSeparadorDia devuelve Hoy para la fecha actual
✔ agruparMensajes agrupa mensajes consecutivos del mismo autor
pass 2, fail 0 (Exit code: 0)

> npm run build
Compiled successfully in 11.6s
Generating static pages using 7 workers (12/12) in 816ms (Exit code: 0)

> cd backend; go vet ./...; go test -count=1 ./...
ok rconceptsys/backend/internal/httpapi 1.739s
ok rconceptsys/backend/internal/store 0.492s (Exit code: 0)
```

### 4.2 Script E2E Real (`_qa/e2e_f3c.py`)
Ejecutado con backend Go en puerto 8310 y frontend Next.js en puerto 3310 con datos reales en Supabase:
- **Admin**: `rc-prueba-admin@example.com`
- **Trabajador 1**: `rc-prueba-trab1@example.com` (Tarea 1: Grabación de video, 10 min a 9000 COP/min = $90.000 COP)
- **Trabajador 2**: `rc-prueba-trab2@example.com` (Tarea 2: Edición de video = $9.000 COP; Tarea 3: Subir video, 5 min a 1000 COP/min = $5.000 COP -> Total $14.000 COP)
- **Resultados de validación paso a paso:**
  1. Admin ve las cifras de Trabajador 1 ($90.000 COP, 10 min, Grabación 1 trab).
  2. Cambio de preset a "Mes pasado": muestra estado vacío ("Aún no tiene trabajos aprobados en este período").
  3. Regreso a "Este mes": restablece $90.000 COP y 10 min.
  4. Enlace "Ver en Estadísticas" apunta a `/admin?pestana=estadisticas&persona=<id1>` y al pulsarlo abre `/admin` en la pestaña Estadísticas con el filtro de persona aplicado.
  5. Admin ve las cifras de Trabajador 2 ($14.000 COP, 2 trab., 5 min, desglose con Edición de video y Subir video).
  6. Admin abre su propio perfil `/equipo/<adminId>`: NO se muestra la tarjeta de Trabajos hechos.
  7. Trabajador 1 abre el perfil de Trabajador 2: NO ve la tarjeta y la red confirma 0 peticiones a `/api/admin/estadisticas`.
  8. Trabajador 1 abre su propio perfil `/perfil`: Muestra exactamente sus cifras ($90.000 COP, 1 trab., 10 min).
  9. En Gestión > Estadísticas, pulsar el nombre en "Más trabajos por persona" abre `/equipo/<id1>`.
  10. Medición geométrica y capturas en 1280px y 375px sin colisiones y sin scroll horizontal.

### 4.3 Limpieza Estricta de Base de Datos
Al finalizar las pruebas, se ejecutó `limpiar_f3.mjs` y `limpiar_rc.mjs`, verificado con `estado_db.mjs`:
```json
tipos [{"clave":"grabacion_video","unidad":"minuto","precio":9000,"activo":true},{"clave":"edicion_video","unidad":"trabajo","precio":9000,"activo":true},{"clave":"subida_video","unidad":"minuto","precio":1000,"activo":true}]
clientes []
tareas [{"n":0}] facturas [{"n":0}]
usuarios [{"email":"jestalvz@gmail.com"},{"email":"ladlejuan26@gmail.com"}]
```
La base de datos conserva intactos los precios de Juan (9000, 9000, 1000), 0 clientes, 0 tareas, 0 facturas y únicamente los 2 usuarios originales.

---

FASE-F3C TERMINADA
