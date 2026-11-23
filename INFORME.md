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
