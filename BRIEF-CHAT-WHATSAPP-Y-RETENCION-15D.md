# BRIEF: Chat estilo WhatsApp (con estética RConcept) + Retención segura de 15 días

**Reglas duras:** rama `desde-cero`, sin commit ni push, sin tocar `.env*`, `Sensible\`, datos de producción ni secretos. Máximo 1 servidor local de QA. Actualizar `docs/arquitectura/flujos.json` y correr `npm run mapa`, `npm run typecheck`, `npm run lint`, `npm test`, `cd backend && go vet ./... && go test -count=1 ./...`.

## 1. Chip del adjunto encima del input del chat (no encima del botón `+`)
- En el compositor del chat del equipo (`app/(app)/page.tsx` y `chat.module.css`), cuando hay una carpeta/adjunto seleccionado (ej. «El Jerez del Caballero ×»), alinear el chip **sobre la columna del campo de texto (`Escribe al equipo...`)**, nunca sobre el botón circular `+`.

## 2. Notas de voz / audios en el chat del equipo (onda estilo WhatsApp, estilo RConcept)
- Permitir grabar y enviar notas de voz (o adjuntar audio) en el chat del equipo.
- Renderizar cada audio con estética RConcept (neumorfismo claro, oscuro y Glass) inspirada en la burbuja de WhatsApp: botón Play/Pause, barra de forma de onda/progreso interactiva (se puede arrastrar o hacer clic para saltar), duración real / tiempo transcurrido, hora discreta y avatar/ícono de micrófono del autor.

## 3. Menú de acciones del mensaje (flecha al pasar el cursor en escritorio + pulsación larga en celular)
- En escritorio (`pointer: fine`): al hacer hover sobre un mensaje, mostrar una flechita discreta en la esquina superior derecha de la burbuja que abre un menú desplegable vertical con ícono + texto (`Responder`, `Copiar`, `Editar` si es propio, `Conservar / No purgar` si tiene medio, `Eliminar` en rojo si está permitido).
- En celular / táctil: mantener presionado el mensaje (long-press ~400 ms con feedback visual limpio, sin interferir con el scroll) para abrir el mismo menú o hoja inferior cómoda.

## 4. Burbujas de mensajes y respuestas citadas estilo WhatsApp (con estilo RConcept)
- Mensajes propios alineados a la derecha con tono sutil propio; mensajes de otros a la izquierda.
- Soportar **Responder (citar)** un mensaje: al responder, mostrar el bloque de cita incrustado arriba del texto con barra lateral de color acento, nombre del autor citado y extracto truncado (clic en la cita salta/resalta el mensaje original si está cargado).
- Hora discreta en la esquina inferior derecha de la burbuja; agrupamiento compacto entre mensajes consecutivos del mismo autor.
- Todo respetando tokens neumórficos en claro, oscuro y Glass, 375 px y 1280 px.

## 5. Retención segura de almacenamiento en Supabase (purga cada 15 días)
- Objetivo: evitar que se llene Supabase Storage sin borrar nunca nada que el equipo quiera conservar.
- Reglas de seguridad:
  1. Solo aplica a **archivos binarios en Storage** (audios, imágenes, videos de chat y adjuntos de asignaciones **ya aprobadas o canceladas** con más de **15 días** de antigüedad).
  2. **Nunca** borra enlaces/referencias de Google Drive ni el texto de los mensajes/tareas.
  3. **Nunca** borra adjuntos de tareas que sigan abiertas, en curso, en revisión o devueltas (solo cerradas/aprobadas/canceladas hace >15 días).
  4. Soportar marca **`conservar` (booleano)** en adjuntos/medios de chat para proteger explícitamente archivos importantes contra la purga (con acción en el menú del mensaje/adjunto).
  5. En el cron (`/api/cron/adjuntos` o ruta dedicada ejecutada por el mismo cron seguro con `CRON_SECRET`): borrar primero el objeto en Storage, marcar el registro como `purgado_en = now()` (conservando el historial y la transcripción/resumen si existía) y registrar conteo. En la UI, un archivo purgado muestra un aviso limpio «Archivo eliminado tras 15 días para liberar espacio» en vez de un error o enlace roto.
  6. Si requiere columnas nuevas (`conservar`, `purgado_en`, `respuesta_a_id` para citas), crear migración idempotente numerada (`027_chat_whatsapp_y_retencion.sql`), anotarla en `supabase/ORDEN.md` y documentarla (no aplicarla contra producción).

## Verificación
- Tests TS y Go (incluyendo pruebas de retención: no borra <15d, no borra tareas abiertas, no borra `conservar=true`, no borra enlaces Drive, sí purga cerradas >15d y marca `purgado_en`).
- QA visual headless 375 px y 1280 px en claro, oscuro y Glass.
- Dejar cambios sin commit ni push y entregar resumen con rutas, pruebas y riesgos.
