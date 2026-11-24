# Informe F8 · RConcept Systems

**Código verificado y enviado solo a `origin/desde-cero`:** `f8413fedd0693e4f0b57969b78265de103c30398`. Sin publicación a producción.

- Drive organizado bajo `RConcept`, con carpetas de clientes y trabajos. Traslados antiguos con simulación y confirmación separadas.
- Desconexión roja con Sí/No. El selector de referencias usa el Drive del equipo sin un segundo consentimiento. Los miembros consultan las fichas, pero no las editan; la foto de perfil propia quedó intacta.
- Pasaron lint, TypeScript, build/vet/tests Go y mapa. 40 capturas en dos tamaños y temas, con ambos roles. Google Picker se probó con un doble; no se accedió ni se movió nada en el Drive real.

**Tarea 6:** retirado el texto de relleno de Avisos y recortadas ayudas, estados vacíos, errores y toasts en toda la app. El inventario antes/después está en el reporte. La revisión headless dejó 48 capturas en `capturas-f8-textos/`.

**Entregables:** [reporte técnico](<HARNESS-REPORTE-F8.md>) · [capturas y mediciones](<capturas-f8/INDICE.md>) · [migración 021](<supabase/migrations/021_drive_organizado.sql>) · [orden de migraciones](<supabase/ORDEN.md>).

**Para Elías:** aplicar 021 antes del despliegue. Después validar el Picker real con la cuenta autorizada; en Gestión → Equipo, organizar y revisar la simulación antes de confirmar el traslado. La migración no mueve archivos.

---

# Informe F7 · RConcept Systems

## Cambios

- **RIA:** saludo centrado, sugerencia según rol, respuestas sin tarjeta, «Pensando», caja fija abajo y desplazamiento que sigue la respuesta sin arrastrar a quien subió a leer. El dictado deja el texto en la caja. Monograma nuevo en el chat privado y de equipo; la barra lateral conserva su icono y comportamiento por la regla de no modificarla.
- **Trabajos:** formulario común con **Especificaciones** desde Tareas, Trabajos y el perfil del miembro. Los listados comparten filas con avatar, estado, fecha y **Abrir**. El detalle muestra el historial disponible, permite editar según estado y pide confirmación para cancelar. La revisión de entregas sigue en la bandeja de Tareas.
- **Clientes:** búsqueda con lupa, una acción **Ver** por cliente, ficha y edición en páginas independientes. Las estadísticas se calculan en Go con los trabajos del cliente. La foto se carga a un bucket privado y Google Picker selecciona carpetas o archivos por título sin alterar la carpeta operativa. Se quitó **Paquete contratado** de la interfaz; la columna y los datos no se modificaron.

## Verificación

`npm run mapa`, `npm run lint`, `npm run typecheck`, `go build ./...`, `go vet ./...` y `go test ./...` pasaron. [48 capturas y mediciones](capturas-f7/INDICE.md) a 375×812 y 1280×800, en claro y oscuro. Ninguna de las pantallas medidas tuvo desborde horizontal. Las pruebas visuales usaron datos de prueba; Go se verificó aparte con el backend demo sobre memoria.

## Antes de desplegar

1. Aplicar [019_clientes_f7.sql](supabase/migrations/019_clientes_f7.sql) en Supabase. Es idempotente y no se ejecutó desde esta sesión.
2. Habilitar Google Picker en `rconcept-systems` y configurar `GOOGLE_PICKER_API_KEY`, `GOOGLE_PICKER_APP_ID` y los orígenes autorizados del cliente OAuth existente. La cuenta de Drive conectada debe poder abrir la referencia seleccionada.
3. Validar con cuenta real la selección de archivo y carpeta, una foto en Storage y un dictado con micrófono físico. También queda por comprobar RIA con su proveedor real; el QA automatizado usó una respuesta controlada.

Ver [HARNESS-REPORTE.md](HARNESS-REPORTE.md) para hashes y pasos para retomar. No se desplegó producción ni se tocó `main`. El informe anterior permanece en el historial Git.
