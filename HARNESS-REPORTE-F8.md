# F8 · Drive organizado, selector y permisos

- Base: `51112d6d3aaa1e425091773e1c81acb5b883759c`.
- Implementación validada: `f8413fedd0693e4f0b57969b78265de103c30398`, autor Git configurado `Juan`, rama `desde-cero`.
- No se publicó en producción ni se tocó `main`. No se aplicó SQL.

## Cambios

- Gestión → Equipo: **Desconectar Drive** usa la variante de peligro, con confirmación Sí/No en línea. **Organizar Drive** prepara `RConcept/Clientes`, `Recursos` y `Archivo`. Muestra `Carpeta raíz: RConcept` y **Abrir en Drive**.
- Altas y organización completan la carpeta del cliente con `Material del lugar` y `Producto`. Se reutilizan las columnas anteriores `drive_carpeta_id` y `drive_url`; [021](<supabase/migrations/021_drive_organizado.sql>) agrega la rama preparada `carpeta_clientes_id` y figura en [ORDEN.md](<supabase/ORDEN.md>).
- El trabajo nuevo se organiza por fecha límite, tipo y descripción, con subcarpetas `Material` y `Entregas`; si no tiene cliente se crea bajo `RConcept`. Se distingue cada trabajo aunque el nombre coincida. Si Google no responde, se guarda el trabajo y el admin puede reintentar desde su ficha. Las entregas copiadas por la app van a `Entregas`.
- **Simular movimientos** no escribe en Drive. **Aplicar movimientos** requiere una huella vigente ligada al admin y a la conexión. Revalida antes de mover y usa `files.update` con `addParents` y `removeParents`; no usa DELETE ni mueve carpetas por búsqueda global de nombre. Exige propiedad, ID registrado, padre `Mi unidad`, destino válido y procedencia compatible. Para el legado sin marca privada se exige también URL registrada exacta, nombre histórico exacto `T-ID Título` y atribución de Drive; Google define `isAppAuthorized` como [creado **o abierto** por la app](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), no como prueba de creación por sí solo. Lo no verificable se omite.
- El selector solicita a Go el token efímero en cada apertura, sin flujo adicional de OAuth de Google ni refresh token en el navegador, sin caché. Abre en la carpeta operativa válida o en `RConcept`. El access token conserva el alcance Drive de la conexión, se entrega solo a administradores y no se persiste en el cliente. Sin conexión, el selector queda inactivo y explica dónde conectar.
- El miembro aprobado ve clientes y fotos de solo lectura; los trabajos que aparecen en su ficha son únicamente los suyos. El acceso directo a la ruta de edición no monta el formulario. Gestión no monta controles de administración para miembros. La foto del perfil propio no se cambió.

## Qué se movió

| Entorno | Resultado |
|---|---|
| Drive real | **Ninguna carpeta**. No se abrió la cuenta de Google ni se ejecutó la simulación sobre datos reales. |
| Integración Go con doble de Google | `T-<id> Rodaje anterior`: de `Mi unidad` a `RConcept/Clientes/Estudio d'Ávila`. Una carpeta deliberadamente ajena conservó su padre; simulación y confirmación inválida hicieron 0 escrituras. |
| Headless con fixtures | `T-15 Grabación anterior` → `RConcept/Clientes/Estudio Norte`, visible en simulación y en el resultado del doble. |

## Estilos revisados

- [Picker](<components/PickerDriveCliente.tsx>) y [ficha](<components/PaginaCliente.tsx>): referencias Abrir/Quitar, carpeta del cliente, Material del lugar, Producto y navegación de ficha. Los enlaces de acción usan el mismo `rc-btn--secundario rc-btn--sm` que un botón, sin visitar/seleccionar texto. Los iconos de enlace externo acompañan solo aperturas en otra pestaña.
- [Clientes](<components/ClientesPanel.tsx>), [filas de trabajo](<components/FilaTrabajo.tsx>) y [página de trabajo](<components/PaginaTrabajo.tsx>): Ver, Abrir, Volver, Revisar entrega; en la navegación interna se usa chevrón o flecha de vuelta, no indicador de otra pestaña.
- [Equipo](<components/admin/AdminEquipo.tsx>), [aviso de cambio en Drive](<app/(app)/drive-cambio/page.tsx>), [enlace de entrega](<components/ui/EnlaceDrive.tsx>) y [carpeta de tarea](<components/ui/CarpetaDriveTarea.tsx>): acciones de abrir/crear con variante secundaria y foco visible.
- [Selector de carpeta de trabajo](<components/SelectorCarpetaTrabajo.tsx>), [notificaciones](<components/CampanaNotificaciones.tsx>) y [RIA](<app/(app)/ria/page.tsx>): Reintentar ya no es un botón de texto pelado. Se revisaron los controles JSX y CSS de `components` y `app`; conservar el estilo propio de navegación, tarjetas, botones icono y enlaces editoriales no equivale a dejar el estilo del navegador.

## Evidencia

- Pasaron `npm run lint`, `npm run typecheck`, `go build ./...`, `go vet ./...`, `go test ./...`, `npm run mapa` y el verificador de documentos de RIA. [Flujos](<docs/arquitectura/flujos.json>) y [mapa generado](<docs/arquitectura/mapa.html>) actualizados.
- Pruebas Go de F8: 17 casos de bloqueo 403; ficha filtrada por asignación; foto propia llega al validador; retorno OAuth con state real de prueba, árbol idempotente, tarea con/sin cliente, tareas homónimas separadas, Picker sin refresh ni caché, simulación, rechazo de huella inválida, movimiento y desconexión.
- API local demo: `admin-1` ficha 200, Drive 200; `cam-1` ficha 200, Drive 403, sin Supabase. Backend y Next se usaron en tandas separadas. PIDs de Next `22516` y `23964`; backend demo `22888` y `2688`, todos cerrados.
- 40 [capturas y mediciones](<capturas-f8/>) en Edge headless, con ancho 375 y 1280, claro/oscuro y los dos roles. Se probaron foco, Escape del selector, selección, desconexión Sí/No, simulación/aplicación, selector deshabilitado y ausencia de desborde horizontal. El diálogo de Google es un doble visual identificado; no acredita apariencia ni permisos del iframe real. [Guion reproducible](<scripts/qa-f8.mjs>).
- No se modificaron `.env*`, `Sensible`, `vercel.json`, perfil propio ni `backend/internal/httpapi/ria_modelo.go`.

## ESTADO PARA RETOMAR

1. Elías: aplicar [021](<supabase/migrations/021_drive_organizado.sql>) después de 020 y antes de desplegar. No se requiere ejecutar SQL para mover carpetas.
2. Cuando Juan diga «publica», Elías publica según el flujo del repo. En una cuenta de prueba o en un entorno autorizado, confirmar el Picker real con el proyecto Google Cloud configurado y la cuenta de Drive de equipo.
3. Como admin: Gestión → Equipo → **Organizar Drive** → **Simular movimientos**. Revisar las carpetas que se enumeran y las omitidas. Confirmar **Aplicar movimientos** solo tras revisar el plan; guardar el resultado real de qué se movió. Si el legado no trae evidencia suficiente, no forzar el traslado masivo.
