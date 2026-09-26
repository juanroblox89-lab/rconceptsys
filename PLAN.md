# RConcept Systems v2 — Plan de cómo funciona todo

> Borrador 1 · 2026-09-26 · para revisión de Juan. Base técnica: **Globe** (Next.js + backend Go en Vercel + Supabase).
> Nada de esto está construido todavía. El sistema viejo vive en el tag `legacy-v1` (solo como referencia de ideas).

## 1. Qué es

El sistema operativo interno de **Rohlfing Concept**: todo el ciclo de producción de contenido para clientes, en un solo lugar.

```
Lead (CRM) ──► Cliente ──► Estrategia ──► Pieza de contenido ──► Tareas (grabar / editar / subir) ──► Entregada
                                                                        │
                                                                        └──► Cobro automático del empleado ──► Corte de pagos
```

Quién lo usa:

| Rol | Qué hace en el sistema |
|---|---|
| **Admin** (Samuel, Juan) | Todo: clientes, asigna tareas, aprueba cobros, ve métricas, administra usuarios y tarifas. |
| **Productor / camarógrafo** | Ve sus grabaciones, marca hechas, registra minutos grabados. |
| **Editor** | Ve sus ediciones, sube el link del entregable, pide revisión. |
| **Community / marketing** | Publica piezas aprobadas, marca subidas. |
| **Vendedor** | CRM: leads, visitas en la calle desde el celular (funciona sin internet). |

Un usuario puede tener varios roles. Entra con Google; la primera vez queda **pendiente** hasta que un admin lo aprueba y le da rol.

## 2. Arquitectura (igual que Globe)

```
Celular (app Android)  ─┐
                        ├─►  Next.js (web/)  ──proxy /api/backend/*──►  Backend Go (backend/)  ──►  Supabase (Postgres + Auth + Storage)
Navegador (PC)         ─┘                                                     │
                                                                              ├─►  IA (9router → Groq → Qwen, la cadena de Globe)
                                                                              └─►  Push (FCM para Android, Web Push para PC)
```

- **Un solo repo, dos servicios en Vercel** (mismo `vercel.json` "services" que Globe): `web` = Next.js 16 + TypeScript, `api` = Go. Next llama a Go por un proxy con lista blanca de rutas y un secreto interno (`X-RC-Internal`), igual que Globe.
- **El backend Go manda.** Toda regla de negocio vive en Go: quién puede hacer qué, cálculo de cobros, cambios de estado. El navegador nunca escribe directo en la base.
- **Permisos en un solo lugar:** `backend/internal/permisos` → `puede(usuario, accion, recurso)`. Cada endpoint lo llama. RLS en Supabase como segunda capa (anon = nada).
- **Auth:** Supabase Auth con Google. Go valida el JWT en cada request (con caché, como `UserFromToken` de Globe).
- **Base de datos nueva desde cero** (proyecto Supabase nuevo). Migraciones numeradas en `supabase/migrations/NNN_nombre.sql`, snake_case, IDs `uuid`, `created_at/updated_at/created_by` en todo, borrado suave (`deleted_at`) + historial de actividad.
- **App Android:** Capacitor envolviendo la web desplegada (una sola base de código). Push nativo por FCM, cámara/galería para subir fotos de visitas, cola offline (IndexedDB) que sincroniza sola al volver la señal.
- **IA:** módulo `backend/internal/agente` reutilizando la cadena de proveedores de Globe. Ayuda a escribir guiones, proponer hooks y armar estrategia por cliente. Solo lee datos y crea **borradores**; nunca borra ni aprueba nada.
- **Claves:** solo en variables de entorno (Vercel / `.env.local`). Nunca en el repo (el repo viejo filtró la service role; no se repite).

## 3. Módulos y cómo funciona cada uno

### 3.1 Clientes
Ficha: nombre, logo, contacto, paquete contratado (los de rohlfingconcept.com: TV / Digital / Mixtos), estado (activo, pausado, terminado), link a Drive, notas. Pestaña **Estrategia**: objetivos, público, tono, formatos y hooks recomendados para ese cliente.

### 3.2 Producción (el corazón)
- **Pieza** = un contenido a entregar (ej. "Reel Día del Padre — El Tizón Dorado"). Tiene cliente, formato, guion, fecha de publicación.
- Cada pieza pasa por un **flujo fijo**: `Guion → Grabación → Edición → Revisión → Aprobada → Publicada`.
- Cada etapa que requiere trabajo genera una **tarea** asignada a un empleado, con fecha límite. Al completar una etapa se crea sola la tarea de la siguiente (el admin elige a quién, o queda en "sin asignar").
- Vistas: **tablero por etapa** (admin), **mis tareas de hoy / semana** (empleado), calendario de publicaciones.
- Avisos push: tarea nueva, tarea vence mañana, revisión pedida, pieza aprobada.

### 3.3 Cobros de empleados
- **Tarifas** configurables por el admin (ej. grabación por hora/minutos, edición por duración del video, subida por pieza). Se toman de la tabla real de edición del sitio cuando aplique.
- Al marcar una tarea **completada**, Go crea la **línea de cobro** con la tarifa vigente (queda congelado el valor de ese momento).
- **Doble validación:** el empleado confirma su línea → el admin la aprueba o la devuelve con comentario.
- **Corte de pagos** (quincenal o mensual): suma lo aprobado por empleado, se marca pagado, exporta CSV/PDF.
- El empleado ve siempre cuánto lleva ganado en el periodo.

### 3.4 Biblioteca
Formatos (estructura, objetivo, KPIs), hooks (patrón, psicología, ejemplos), referencias (links analizados), **SOPs** (checklists por rol que se pueden ejecutar y quedan registrados). Arranca con el contenido rescatado en `contenido/formatos-y-hooks.js`.

### 3.5 CRM (ventas)
Leads en tablero (nuevo → contactado → propuesta → ganado / perdido), visitas en la calle desde el celular (foto, ubicación, notas; funciona offline), próxima acción con recordatorio. **Lead ganado → se convierte en cliente** con su paquete, sin volver a escribir nada.

### 3.6 Panel
Métricas: piezas entregadas por semana, tareas vencidas, carga por empleado, cobros pendientes, leads por etapa.

## 4. Diseño

- **Panel con la estructura de Globe** (sidebar compacta, paneles sólidos, navegación persistente) **en blanco y negro como rohlfingconcept.com**. Tema claro.
- Estilo compacto de Juan (`~/.claude/skills/compact-ui`): poco aire, 13–14 px, tarjetas parejas, primero celular 375 px.
- Logo de `marca/`.

## 5. Fases de construcción

| Fase | Qué incluye | Resultado visible |
|---|---|---|
| **F0 Fundación** | Repo (web + backend + supabase), Vercel services, login Google + aprobación, roles y permisos, shell del panel, app Android básica | Entrar, ser aprobado, ver el panel vacío en PC y en el celular |
| **F1 Producción** | Clientes, piezas, flujo de etapas, tareas, "mis tareas", push | El equipo trabaja en el sistema nuevo día a día |
| **F2 Cobros** | Tarifas, líneas automáticas, doble validación, cortes, export | Se paga con el sistema |
| **F3 Biblioteca** | Formatos, hooks, referencias, SOPs | Conocimiento del equipo centralizado |
| **F4 CRM** | Leads, visitas offline, conversión a cliente | Ventas en el sistema |
| **F5 IA + métricas** | Asistente de guiones/estrategia, panel de métricas | Ayuda y visión general |

Cada fase: brief al harness → revisión del director a 375/1280 → commits → deploy de preview. El sistema viejo (`main`, rconceptsys.vercel.app) sigue en uso hasta que F1+F2 estén listas; ahí se cambia.

## 6. Decisiones pendientes de Juan

1. **Datos del sistema viejo:** ¿empezamos con la base vacía, o migramos lo real del Supabase viejo (usuarios, clientes, facturas)?
2. **Cobros:** ¿cómo se paga hoy? (por tarea con tarifa fija, por minutos, mensual…) y cada cuánto se hace el corte.
3. **Equipo:** cuántas personas y qué roles reales.
4. **Android:** ¿APK instalado directo o publicado en Google Play?
5. **Dominio:** ¿`rconceptsys.vercel.app` sigue, o un dominio propio?
