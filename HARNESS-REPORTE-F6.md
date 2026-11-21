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

## Migraciones · sin aplicar

1. `supabase/migrations/012_clientes_flujo.sql`: logo y carpetas de Drive del cliente. Conserva las columnas y políticas de lectura previas; revoca escritura cliente.

## Estado para retomar

Fase 2 → bandeja, preferencias, cola de Web Push en Supabase, cron y vigilancia de Drive. Fases 3–7 y QA final aún pendientes. No se deben aplicar las migraciones desde el agente.
