# Backend Go — RConcept Systems v2 (F0)

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

Oficios en minúsculas sin tildes (`grabacion`, `edicion`, `diseno`,
`estrategia`, `publicacion`, `ventas`); el backend acepta formas con tilde
(`grabación`, `estrategia/guion`, …) y las normaliza
(`internal/permisos`, `NormalizarOficios`).
