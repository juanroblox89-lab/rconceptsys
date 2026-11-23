# Capturas F7

Edge headless · 375×812 y 1280×800 · claro y oscuro. Cada grupo tiene cuatro PNG y las mediciones JSON por combinación confirman sin desborde horizontal y con el color de fondo correspondiente. Se usaron datos de prueba, no datos de producción.

| Serie | Pantalla |
|---|---|
| 01–03 | RIA: saludo, pensando y respuesta |
| 04–06 | Todas las tareas, detalle editable y listado Trabajos |
| 07–08 | Perfil de miembro y asignación con persona preseleccionada |
| 09–11 | Clientes, ficha y edición |
| 12 | Campana de notificaciones |

Ejecutar `node scripts/qa-f7.mjs` con Next de QA en `127.0.0.1:3313`. Web Speech, Google Picker y respuestas HTTP se simulan en el navegador para que el recorrido sea reproducible sin credenciales. La API Go se verificó por separado en memoria.
