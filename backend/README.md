# Backend Go — RConcept Systems v2 (F0+F1)

Solo stdlib (`net/http`, `encoding/json`). Puerto `:8095` (`PORT` lo cambia).

## Correrlo

```powershell
cd backend
go vet ./...
go test ./...
go run ./cmd/server            # modo demo
# o con Supabase:
$env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."
go run ./cmd/server
```

Nunca escribir claves reales en el repo (ver `.env.example` en la raíz).

## Modos

| | Demo | Supabase |
|---|---|---|
| Cuándo | sin `SUPABASE_URL` | con `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| Store | memoria + 4 semillas | REST con service role (tablas `usuarios`, `actividad`) |
| Auth | cabecera `X-Demo-User` | `Authorization: Bearer <token>` verificado contra Auth (caché 60s) |
| Primer login | n/a (semillas fijas) | crea la fila: `pendiente`, salvo tabla vacía → `dueno` |

## Selector demo (`X-Demo-User`)

Acepta **id, email o acceso**. Sin cabecera (o sin coincidencia) → `401`.

| Valor | Usuario | Acceso |
|---|---|---|
| `dueno` | Samuel (`samuel@demo.rconceptsys`) | dueno, todos los oficios |
| `admin` | Coord Admin (`admin@demo.rconceptsys`) | admin |
| `equipo` | Breiner (`breiner@demo.rconceptsys`) | equipo (grabación+edición) |
| `pendiente` | Nuevo Pendiente (`pendiente@demo.rconceptsys`) | pendiente |

UUID estables en `internal/store/memory.go` (`SemillaDuenoID`, …).

## Seguridad

- `GET /health` va sin auth y sin secreto interno.
- Todo lo demás exige `X-RC-Internal: $RC_INTERNAL_SECRET` cuando el secreto
  está configurado (obligatorio en Vercel; opcional en local) → si no, `403`.
- Cada endpoint llama a `permisos.Puede` (matriz `ANALISIS.md` §3.2) más los
  chequeos finos §5.4 (último dueño → `409`) y §5.5 (admin no toca
  admin/dueño → `403`), con mensajes en español.
- CORS directo solo para `http://localhost:3300` y `http://127.0.0.1:3300`
  (el proxy Next es mismo-origen y no necesita CORS).

## Contrato F0

- `GET /me` → `{usuario, modulos}` (8 módulos en orden, `habilitado` solo en
  `equipo` para dueño/admin y `mi-perfil` para todos menos
  pendiente/desactivado). Pendiente → `200`; desactivado → `403`.
- `GET /usuarios` → `{usuarios}` (dueño/admin).
- `POST /usuarios/{id}/aprobar` `{acceso?: equipo|admin, oficios?, motivo?}` →
  Usuario plano. Admin solo aprueba como equipo.
- `PATCH /usuarios/{id}` `{acceso?, oficios?, motivo}` → Usuario plano.
  `motivo` obligatorio si cambia acceso u oficios.
- `POST /usuarios/{id}/desactivar` `{motivo?}` → Usuario plano.
- `GET /actividad?recurso=...` → `{eventos}` (dueño/admin).

## Contrato F1 (producción: clientes, piezas, tareas)

Estados pieza: `borrador → en_produccion → en_revision → aprobada → publicada`
(+ `cancelada` con motivo, solo admin/dueño). Estados tarea:
`bloqueada → pendiente → en_curso → entregada → aprobada` (+ `devuelta` con
comentario, `cancelada`). Idempotencia: repetir la misma acción en el mismo
estado = `200` sin duplicar. Conflicto de edición: `updated_at` viejo → `409`
"esto cambió mientras editabas". Vencida: `fecha_limite` pasada y no aprobada
(flag `vencida` calculado).

- `GET /clientes` → `{clientes}` (equipo: solo donde tiene/tuvo tareas;
  archivados fuera salvo `?incluir_archivados=1`).
- `POST /clientes` `{nombre, logo_url?, contacto_*?, paquete?, estado?, drive_url?, notas?, estrategia?}` → `201` (admin/dueño).
- `GET /clientes/{id}` → `{cliente, piezas, historial}`; cliente ajeno (equipo) → `403` sin datos.
- `PATCH /clientes/{id}` `{campos..., updated_at}` → `200`; `409` si cambió.
- `POST /clientes/{id}/archivar` → `200 {archivada}` (nunca se borra).
- `GET /piezas?cliente=&estado=&asignado=` → `{piezas}` (equipo: solo sus clientes).
- `POST /piezas` `{cliente_id, titulo, formato?, guion?, fecha_objetivo?, etapas:[{etapa, asignado_id?, fecha_limite?}]}` → `201 {pieza, tareas}`. Valida oficio (§5.8 → `422`) y cliente pausado (`400`).
- `GET /piezas/{id}` → `{pieza, tareas}` (con datos de entrega y `vencida`).
- `PATCH /piezas/{id}` `{titulo?, formato?, guion?, fecha_objetivo?, estado?, updated_at}` → `200`; cancelar por aquí → `400` (usar `/cancelar`).
- `POST /piezas/{id}/cancelar` `{motivo}` → `200 {cancelada, tareas}` (motivo obligatorio; admin/dueño).
- `GET /tareas?asignado=&estado=&cliente=&vista=hoy|semana|vencidas|por_revisar` → `{tareas}` (equipo: solo suyas).
- `GET /tareas/{id}` → `{tarea, eventos}`.
- `POST /tareas/{id}/empezar` → `200` (asignado o admin).
- `POST /tareas/{id}/entregar` `{material_url?, minutos?, entregable_url?, publicado_url?}` → `200`; falta el dato de la etapa → `400` (§5.9: principal = link+minutos, apoyo = minutos, edición/diseño = link, publicación = link).
- `POST /tareas/{id}/aprobar` → `200` (admin/dueño; desbloquea la siguiente etapa; el apoyo no bloquea).
- `POST /tareas/{id}/devolver` `{comentario}` → `200` (comentario obligatorio; queda en el historial).
- `PATCH /tareas/{id}` `{asignado_id, updated_at}` → `200` reasignar (admin/dueño; valida oficio → `422`).
- `GET /tareas/{id}/eventos` → `{eventos}`.
- `GET /notificaciones` → `{notificaciones}` (propias).
- `POST /notificaciones/{id}/leer` → `200` (la ajena → `404`).

Semillas demo F1 (memoria): 7 clientes (`Villa Grande`, `Plomería Norte`,
`El Tizón Dorado`, `Ricos Pandeyucas`, `Asanarte Droguería`,
`El Jerez del Caballero`, `Kantel`) + pieza demo de Villa Grande con
grabación principal (Breiner, en curso) + edición (Breiner, bloqueada) +
publicación (sin asignar). Oficio por etapa: grabaciones → `grabacion`,
edición → `edicion`, diseño → `diseno`, publicación → `publicacion`
(Breiner solo puede recibir grabación/edición: publicar la hace Samuel).

Oficios en minúsculas sin tildes (`grabacion`, `edicion`, `diseno`,
`estrategia`, `publicacion`, `ventas`); el backend acepta formas con tilde
(`grabación`, `estrategia/guion`, …) y las normaliza
(`internal/permisos`, `NormalizarOficios`).
