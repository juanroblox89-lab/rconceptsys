# INFORME · F5 de rconceptsys

**Qué se hizo:** los 8 bloques del brief F5 (barra de equipo, Recientes y Asignaciones, perfil al pie, chat con adjuntos y audios, conector de Google Drive, clientes y piezas, corte de pagos y avisos push), con migraciones SQL nuevas **sin aplicar**, verificación completa y capturas a 375 y 1280 px.

**El detalle completo está en** [HARNESS-REPORTE-F5.md](HARNESS-REPORTE-F5.md): qué quedó bloque por bloque, salida real de los comandos, capturas, orden de las migraciones, lo que necesita Juan (credenciales de Google y claves VAPID) y lo pendiente marcado como pendiente.

## Resumen en una tabla

| Bloque | Estado | Dónde se ve |
|---|---|---|
| 1 · Barra derecha "Equipo" | Listo | Chat en ≥1280 px y botón de información en celular; se edita en Gestión → Equipo |
| 2 · Recientes + Asignaciones | Listo (solo admins) | Barra izquierda y página `/asignaciones` |
| 3 · Mi perfil al pie | Listo | Pie de la barra izquierda (o riel colapsado) |
| 4 · Adjuntos y audios del chat | Listo | Botón + y micrófono del chat |
| 5 · Conector de Google Drive | Código listo · **sin probar con credenciales reales** | Gestión → Equipo → Conectar Drive |
| 6 · Fichas de cliente y piezas | Listo | Gestión → Clientes (Ficha) y Gestión → Piezas |
| 7 · Corte de pagos | Listo (CSV y PDF) | Gestión → Cortes |
| 8 · Avisos push | Código listo · **faltan las claves VAPID** | Mi perfil → Avisos en este dispositivo |

## Verificación (resumen)

- `go vet ./...` → 0 · `go test ./... -count=1` → verde (**42 tests** en httpapi, 11 nuevos de F5).
- `npx tsc --noEmit` → 0 · `npm run lint` → 0 · `npm run build` → 14 rutas (nueva `/asignaciones`).
- 16 capturas en `capturas-f5/`, **0 px de desborde horizontal** y 0 errores de página.

## Lo que necesito de Juan

1. Correr las migraciones **006 → 007 → 008 → 009 → 010 → 011** (el bucket `chat` lo crea la 006).
2. **Google Cloud**: habilitar Drive API, crear un cliente OAuth "Aplicación web" con retorno `https://<dominio>/api/drive/callback` y cargar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (y opcional `GOOGLE_REDIRECT_URI`, `GOOGLE_DRIVE_CARPETA_RAIZ`).
3. **VAPID**: `npx web-push generate-vapid-keys` y cargar `VAPID_CLAVE_PUBLICA`, `VAPID_CLAVE_PRIVADA`, `VAPID_ASUNTO`.

## Commits (locales, rama `desde-cero`, sin push ni deploy)

```
c9fa4be F5 backend: equipo, adjuntos del chat, asignaciones, Drive, piezas, cortes y push
f8eeb05 F5 front: chat con adjuntos y audios, barra de equipo, recientes y perfil al pie
0b78780 F5 front: piezas, cortes de pago, ficha de cliente y Drive en Gestion
4bd5fee F5 front: avisos push con service worker en Mi perfil
5efd7cb F5 backend: carpeta de Drive compartida como adjunto del chat
413b0d0 F5: capturas 375 y 1280 de las pantallas nuevas
```
