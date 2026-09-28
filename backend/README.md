# Backend Go — RConcept Systems v2 (F0+F1+F2+F3+F4+F5)

Solo stdlib (`net/http`, `encoding/json`). Puerto `:8095` (`PORT` lo cambia;
en F2 los QA usan `18095`).

## Correrlo

```powershell
cd backend
go vet ./...
go test ./...
go run ./cmd/server            # modo demo (ALLOW_DEMO=1 si hay PORT/VERCEL)
# o con Supabase:
$env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."
go run ./cmd/server
```

Nunca escribir claves reales en el repo (ver `.env.example` en la raíz).

## Demo solo local (S1/S2)

El modo demo (semillas fijas + `X-Demo-User`, sin Supabase) es solo para
desarrollo local: si hay `PORT` o `VERCEL` en el entorno y faltan las
credenciales, el backend **no arranca** salvo `ALLOW_DEMO=1` explícito
(antes degradaba en silencio a demo expuesto con admin total sin secreto).
El proxy Next **no reenvía** `X-Demo-User` cuando hay auth real configurada
(`NEXT_PUBLIC_SUPABASE_URL` presente).

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

## Preasignados (`RC_PREASIGNADOS`)

Lista de "accesos preasignados por email" aplicada al primer login
(BRIEF F2 §7: `dueno@tudominio.com:dueno:` para el dueño inicial).
Formato: `email:acceso:oficio1+oficio2,email2:acceso:oficio…`.
El email preasignado nace con ese acceso+oficios en vez de pendiente, y no
cuenta como "primer usuario = dueño" (si la tabla está vacía y el email
tiene preasignado, se respeta el preasignado). Ejemplo:

```powershell
$env:RC_PREASIGNADOS="dueno@tudominio.com:dueno:,jefe@tudominio.com:admin:edicion"
```

> El PRIMER login de producción debe ser el dueño (con o sin preasignado
> de dueño). Si el primero entra con preasignado de admin/equipo, el
> sistema queda sin dueño y no hay recuperación por API (L3).

## Contrato F2 (cobros: tarifas, líneas, cortes, comisión)

Estados línea: `por_confirmar → confirmada → aprobada → en_corte → pagada`;
`reclamada` (con motivo) → admin responde con ajuste; `sin_tarifa` (sin
tarifa vigente → avisa al dueño). Ajustes = líneas nuevas con motivo, nunca
edición. Periodo = mes `YYYY-MM`; corte mensual día 1 (cerrar: aprobada →
`en_corte`, resto se arrastra al siguiente; cerrado no se reabre; revertir
pagado solo dueño + actividad). Comisión: `precio × %` (default 8,
configurable 0–100), modo `una_vez` (default, al crear cliente) o `mensual`
(POST /comisiones/mensual, idempotente).

- `GET /tarifas` / `POST /tarifas {etapa, unidad, monto_cop, tramos?}` →
  `201` (solo dueño; versiona: desactiva la anterior etapa+unidad). Al fijar
  tarifa se resuelven las `sin_tarifa` pendientes de esa etapa (pasan a
  `por_confirmar` con monto recalculado; F21).
- `GET /paquetes` (dueño/admin + vendedor-ventas para /ganar; BRIEF F4 §3) · `POST /paquetes {nombre, precio_cop}` /
  `PATCH /paquetes/{id}` (solo dueño; §5.27 no toca comisiones viejas).
- `GET /config-cobros` / `PATCH /config-cobros {porcentaje_comision?, modo_comision?}` (solo dueño).
- `GET /lineas?periodo=&usuario_id=&estado=` → `{lineas}` (equipo: solo
  suyas, incluidas sus comisiones; las comisiones ajenas no se ven, F22).
  `GET /lineas/{id}` (misma regla).
- `POST /lineas/{id}/confirmar` (dueña o admin) · `/reclamar {motivo}`
  (dueña o admin) · `/aprobar` (admin/dueño, confirmada|reclamada) ·
  `/devolver {comentario}` (admin/dueño → por_confirmar). Idempotentes.
- `POST /lineas/ajuste {usuario_id, monto_cop != 0, motivo, periodo?}` →
  `201` (admin/dueño; periodo cerrado → siguiente abierto; estado aprobado).
- `GET /cortes` · `GET /cortes/actual?periodo=` · `GET /cortes/{periodo}`
  (dueño/admin: por persona aprobado/por_confirmar/reclamado/en_corte/
  pagado + líneas) · `GET /cortes/mios?periodo=` (trabajador: su resumen +
  historial de sus cortes, §5.22) · `GET /cortes/{periodo}/csv` (CSV, dueño/admin).
- `POST /cortes/cerrar {periodo?}` → `200 {en_corte, arrastradas}` (solo
  dueño). `POST /cortes/{periodo}/pagar {usuario_id?}` /
  `/revertir {usuario_id?}` (solo dueño).
- `POST /comisiones/mensual {periodo?}` (admin/dueño; modo mensual).
- `POST /tareas/{id}/decision {decision: pagar|no_pagar, motivo}` (solo
  dueño; pagar → genera línea, no_pagar → registra motivo).
- `POST /tareas/{id}/aprobar` ahora genera SOLA la línea (tarifa congelada
  o `sin_tarifa`); idempotente por tarea.
- Clientes aceptan `paquete_id` (debe existir) + `vendido_por` (oficio
  ventas, no pendiente/desactivado → `422`); crear con `vendido_por` en
  modo `una_vez` genera la comisión inmediata.

Semillas demo F2 (memoria, `demo=true`): tarifas edición por_tarea 80000 +
grabación por_minuto 2000 + 6 tramos duración ejemplo + 9 paquetes del
brief (TV Basic 300000 … Mixto III 1299000) + config 8/una_vez.

## Contrato F3 (biblioteca: formatos, hooks, referencias, SOPs)

Estados contenido: `borrador → publicado | rechazado`; `publicado →
archivado`; `rechazado → borrador` (reproponer) `| archivado`. Nada se
borra: se archiva. Equipo propone → `borrador` forzado (visible solo para
quien lo propuso + admin/dueño); admin/dueño crea y publica directo.
Publicar/rechazar/archivar: solo admin/dueño (`BibliotecaPublicar`;
equipo → `403`; rechazar exige motivo). Editar: admin/dueño todo salvo
archivado; equipo solo su borrador/rechazado (editar un rechazado lo
vuelve a borrador); equipo no edita lo publicado (`BibliotecaEditar` →
`403`). Borrador ajeno → `404` (no se filtra su existencia). Búsqueda
`?q=` + filtro `?etiqueta=` (más `?categoria=` en hooks, `?plataforma=` en referencias y
`?oficio=` en SOPs). Cada cambio → actividad + notificación al
proponente (publicado/rechazado).

- `GET /formatos?q=&etiqueta=&estado=` → `{formatos}` (publicado todos;
  resto admin/proponente). `POST /formatos {nombre, codigo?, objetivo?,
  estructura?, hooks_recomendados?, kpis?, ejemplos?, etiquetas?,
  estado?: borrador|publicado (solo admin)}` → `201`.
- `GET /formatos/{id}` · `PATCH /formatos/{id}` (mismos campos; sin
  estado) · `POST /formatos/{id}/publicar|rechazar {motivo}|archivar`.
- Igual para `/hooks {titulo, categoria?, psicologia?,
  retencion_esperada?, variaciones?, ejemplos?, etiquetas?}`,
  `/referencias {titulo, link, plataforma?: Instagram|TikTok|YouTube|otra,
  analisis?, etiquetas?, cliente_id?}` (cliente debe existir) y
  `/sops {titulo, oficio?: todos|grabacion|…|ventas (acepta tildes),
  tiempo_estimado_min?, etiquetas?, pasos? [{titulo, descripcion?}]}` →
  `201 {sop, pasos}`.
- `GET /sops/{id}` → `{sop, pasos}`. `GET /sops/{id}/pasos` →
  `{pasos}`. `POST /sops/{id}/pasos {titulo, descripcion?}` → `201`
  (solo SOP borrador/rechazado; en publicado → `400`).
  `PATCH /sop-pasos/{id} {titulo?, descripcion?}` (misma regla).
- `GET /sop-ejecuciones?sop_id=&tarea_id=&mias=1` → `{ejecuciones}`
  (admin/dueño todas; equipo solo suyas). `POST /sop-ejecuciones
  {sop_id, tarea_id?}` → `201` (SOP publicado; tarea ligada: equipo solo
  la suya → `403`). `GET /sop-ejecuciones/{id}` (misma regla).
- `POST /sop-ejecuciones/{id}/pasos {paso_id}` → `200` (marca;
  idempotente; paso de otro SOP → `400`; terminada → `400`).
  `DELETE /sop-ejecuciones/{id}/pasos/{paso_id}` → `200` (desmarca).
  `POST /sop-ejecuciones/{id}/terminar` → `200` (en_curso → terminada;
  idempotente; no se reabre). Solo el dueño de la ejecución o admin.
- Clientes y piezas aceptan `formato_recomendado_id` +
  `hook_recomendado_id` (solo referencia a contenido PUBLICADO → `400`
  si no existe o no está publicado; sin romper F1).

Semillas demo F3 (memoria, `demo=true`, publicados): formatos RC-01
Recorrido Comercial + ED-02 Educativo Rápido (de
`contenido/formatos-y-hooks.js`) + 2 hooks del archivo + SOP checklist
de grabación (4 pasos) + SOP entrega de edición (4 pasos).

## Contrato F4 (ventas: leads, visitas, ganar → cliente)

Estados lead: `prospecto → en_contacto → propuesta_enviada → negociacion →
ganado | perdido` (perdido con motivo obligatorio; ganado/perdido
finales). Idempotencia: repetir la misma transición = `200` sin duplicar.
Vendedor demo: Valentina (`equipo`, oficio `ventas`; `X-Demo-User:
valentina@demo.rconceptsys`) + 2 leads semilla. `/me` habilita `ventas`
para dueño/admin y equipo con oficio ventas (Breiner → deshabilitado).
Al desactivar un vendedor, sus leads abiertos pasan a `sin asignar`
(`vendedor_id` vacío; hook en `POST /usuarios/{id}/desactivar`).

- `GET /leads?estado=&vendedor=&municipio=&mias=1` → `{leads}` (vendedor:
  solo los suyos; equipo sin ventas → `403`). Cada lead trae `vencida`
  (próxima acción pasada en abierto) + `vendedor_nombre`; listar genera la
  notificación in-app (al vendedor el día, al admin si 3+ días; 1 por día).
- `POST /leads {negocio, contacto_nombre?, telefono?, direccion?,
  barrio?, municipio?, rubro?, origen?: visita|referido|redes|llamada,
  valor_estimado_cop?, paquete_id?, notas?, accion_que?, accion_fecha?}`
  → `201` (+ `duplicados` si hay match por teléfono normalizado sin 57 o
  nombre parecido: "ya lo tiene Fulano", sin bloquear). Vendedor crea los
  suyos (dueño = él); admin elige vendedor o sin asignar.
- `GET /leads/{id}` → lead + `historial` + `visitas` (ajeno → `404`;
  equipo sin ventas → `403`).
- `PATCH /leads/{id}` (negocio/contacto/teléfono/dirección/barrio/
  municipio/rubro/origen/notas/acción/paquete; sin estado ni vendedor) →
  `200`.
- `POST /leads/{id}/mover {estado, motivo_perdida?}` → `200` (transición
  válida; perdido exige motivo; ganado por aquí exige cliente enlazado →
  si no, `400` "usá /ganar").
- `POST /leads/{id}/reasignar {vendedor_id}` → `200` (solo admin/dueño;
  `""` = sin asignar; valida oficio ventas → `422`).
- `POST /leads/{id}/ganar {paquete_id?, nombre_cliente?, reactivar_id?}`
  → `200 {…, cliente_id}`: pide paquete (o usa el del lead) y confirma
  datos → crea el cliente F1 con `paquete_id` + `vendido_por` = vendedor
  del lead → F2 genera la comisión 8 % una sola vez (idempotente; repetir
  `/ganar` = `200` sin duplicar cliente ni comisión). Si el negocio ya fue
  cliente → `409 {…, reactivar: {id, nombre, estado}}`; con `reactivar_id`
  lo reactiva (desarchiva + activo) en vez de crear otro. `reactivar_id`
  solo acepta el cliente ofrecido en el 409 (un id arbitrario → `400`, F42);
  si el reintento encuentra el cliente ya activo (fallo al marcar el lead,
  F45) lo vincula sin tocar paquete/vendedor. Ganado sin cliente enlazado
  (dato viejo) → `400` en vez de duplicar (F418).
- `GET /leads/{id}/eventos` → `{eventos}` · `GET /leads/{id}/visitas`.
- `GET /visitas?lead=&vendedor=&mias=1` → `{visitas}` (vendedor: solo las
  suyas). `POST /visitas {lead_id?, negocio?… (crea el lead en prospecto
  con origen visita si no hay lead_id), resultado: interesado|
  no_interesado|volver, client_id?, latitud?, longitud?, notas?, cuando?}`
  → `201`; con `client_id` repetido → `200` con la existente (offline
  §5.23, nunca duplica).
- `POST /visitas/{id}/fotos {datos: base64, nombre?}` → `201` (modo demo
  guarda en memoria, tope 500 KB tras comprimir → `413`; interfaz
  `store.GuardarArchivo` preparada para Supabase Storage).
  `GET /visitas/{id}/fotos` → `{visita_id, fotos}`.
- `GET /ventas/metricas` → `{por_etapa, por_vendedor,
  visitas_por_vendedor, tasa_conversion_mes, ganados_mes, perdidos_mes,
  nuevos_mes}` (vendedor: solo lo suyo).

Semillas demo F4 (memoria, `demo=true`): Valentina vendedora + 2 leads
(El Tizón Dorado en_contacto con próxima acción, Kantel prospecto).

## Contrato F5 (asistente IA + métricas)

Asistente (BRIEF F5 §1, ANALISIS §3.2 fila Asistente + §5.31 + §6):
cadena mínima 9router (`NINEROUTER_BASE_URL` + `NINEROUTER_API_KEY`,
modelo `NINEROUTER_MODEL`, default `oc/big-pickle(xhigh)`) → respaldo
OpenAI-compatible opcional (`OPENAI_COMPAT_*`). `stream:false`,
`User-Agent: Go-http-client/1.1` (default net/http), `max_tokens ≥ 16`.
Sin claves → "no disponible" y el resto funciona igual. Tope diario
`ASISTENTE_TOPE_DIA` (default 30; 0 = sin tope). Timeout 30 s.
Herramientas en Go con `permisos.Puede` del que pregunta (visibilidad por
cliente §3.1.3): `mis_tareas_hoy`, `piezas_atrasadas`, `resumen_mes`,
`ver_pieza`, `ver_estrategia`, `ver_hooks`, `ver_formatos` (lectura) +
`guardar_borrador_guion` y `proponer_hooks` (el modelo propone con
marcadores `[GUARDAR_BORRADOR]`/`[PROPONER_HOOKS]` y GO ejecuta: borrador
en la pieza sin tocar el guion aprobado, hooks como borradores F3).
Nunca aprueba/borra/paga/cambia estados. Actividad "vía asistente".

- `POST /asistente/chat {conversacion_id?, mensaje, contexto?{pieza_id, cliente_id}}` →
  `200 {conversacion, respuesta, no_disponible}` (pendiente → `403`).
- `GET /asistente/conversaciones` → `{conversaciones}` (mías).
  `GET /asistente/conversaciones/{id}` → `{conversacion, mensajes}`
  (ajena → `404`).
- `GET /metricas` → `{piezas_publicadas_semana×8, piezas_por_estado,
  tareas_vencidas, carga_por_persona, cobros_mes, ventas}` (solo
  admin/dueño; equipo → `403`).
- Piezas traen `guion_borrador` (F5; `PATCH /piezas/{id}` lo adopta como
  guion con confirmación en la UI).
