# Reporte F6 · rconceptsys

Rama `desde-cero`. **Entrega en curso.** No se aplicaron migraciones, no se modificaron archivos de entorno y no se publicó en producción.

## Fase 1 · Asignar, recibir y entregar

- Trabajos (`/asignaciones`) lista asignaciones, permite asignar y editar trabajos abiertos, y enlaza a la entrega exacta. La ficha de Equipo y las pantallas de gestión comparten el formulario. Crear un cliente desde el formulario conserva el borrador y lo deja seleccionado. Se conserva el vínculo opcional con Piezas.
- Clientes (`/clientes`) muestra logo, ficha, paquete, notas, enlace y trabajos asociados. El backend prepara **Material del lugar** y **Producto** dentro de la carpeta del cliente al vincularla. Los trabajos nuevos seleccionan o crean su carpeta bajo la del cliente.
- Tareas (`/tareas`) destaca el cliente y la fecha relativa y absoluta, con urgencia en rojo. Los enlaces a avisos resaltan la tarjeta exacta. La persona puede abrir su carpeta y enviar la entrega a revisión.
- Verificación visual local: 18 capturas en `capturas-f6/f1-*-claro.png` a 375 y 1280 px. El recorrido de Playwright comprobó 0 px de desborde horizontal, ausencia de errores de página, borrador intacto tras crear cliente y resaltado al abrir el aviso. Datos sintéticos solo en el entorno demo en memoria. Variante oscura pendiente de la Fase 4; validación real de Drive y push pendiente.
- Salida real de los comandos: `capturas-f6/verificacion-f1.log`.

## Fase 2 · Notificaciones

- Bandeja privada con contador, enlaces a mensajes/tareas/solicitudes/cortes/archivos y «Marcar todo leído». Configuración por tipo, silencio de chat y horario de Bogotá. Las menciones no se silencian.
- Cola persistente en Supabase con reclamación concurrente, deduplicación, registro por dispositivo y reintentos. El cron de cada minuto sustituye los envíos tras responder; también encola vencimientos y conserva el cursor de `changes.list`. Web Push usa el título, cuerpo y enlace de la bandeja.
- El aviso «Respuesta de RIA» está previsto en preferencias; su emisión se integra en la Fase 3. Pendiente verificar Web Push, Google Drive y cron de Vercel con servicios reales. [Vercel exige Pro o Enterprise para el intervalo por minuto](https://vercel.com/docs/cron-jobs/usage-and-pricing); el cron automático no corre en preview. Variable adicional: `CRON_SECRET`. Web Push usa las tres variables VAPID de F5.
- `tsc`, lint, build, `go vet` y `go test`: salida de [`verificacion-f2.log`](capturas-f6/verificacion-f2.log). Playwright comprobó campana, mención con destino directo, preferencias y enlace de Drive en 375 y 1280, sin desbordes ni errores de página. Ocho capturas en claro; oscuro se vuelve a capturar cuando exista en la Fase 4.

## Fase 3 · RIA

- Chat privado con historial de la persona, chat de equipo con `@RIA`, Ayuda con pregunta inicial y eventos SSE sin simular texto en el navegador. El servidor filtra manuales y datos; la respuesta pública no recibe el historial ni los datos privados del solicitante.
- Principal: Claude Sonnet 5.5 con esfuerzo `low` por 9router. Respaldo directo: `https://integrate.api.nvidia.com/v1`, modelo `nvidia/nemotron-3.5-super-vl-120b-a12b`, confirmado en la [referencia oficial de NVIDIA](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b/apireference). Falta confirmar `GET /v1/models` con la cuenta de despliegue y ejecutar ambos proveedores contra credenciales reales. Pruebas simuladas de respaldo para timeout, 503 y 530.
- Variables: `NINEROUTER_BASE_URL`, `NINEROUTER_API_KEY`, `NVIDIA_API_KEY`, `RIA_MODELO_RESPALDO`, `ASISTENTE_TOPE_DIA`.
- Streaming verificado visualmente con el proveedor simulado: dos estados intermedios en cada chat a 375 y 1280 px, indicador visible antes de finalizar y sin desborde, ocho capturas `capturas-f6/f3-ria-*.png`. Salida local en [`verificacion-f3.log`](capturas-f6/verificacion-f3.log).
- Actualizar `docs/ria/` con cada cambio visible y regenerar el contexto con `node scripts/verificar-ria.mjs --generar`. El script del build y el test de Go verifican la cobertura.

## Migraciones · sin aplicar

1. [`012_clientes_flujo.sql`](supabase/migrations/012_clientes_flujo.sql): logo y carpetas de Drive del cliente.
2. [`013_notificaciones.sql`](supabase/migrations/013_notificaciones.sql): bandeja, cola, preferencias y cursor.
3. [`014_ria.sql`](supabase/migrations/014_ria.sql): historial privado, cupo diario y autoría de RIA.

## Estado para retomar

Fases 4–7 y QA final aún pendientes. Las variantes oscuras de las fases anteriores se capturan después de agregar el modo oscuro. No se deben aplicar migraciones desde el agente.
