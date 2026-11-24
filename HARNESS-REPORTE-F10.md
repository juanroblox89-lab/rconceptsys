# HARNESS-REPORTE-F10 · Adjuntos en asignaciones

## Código y alcance

- Base de trabajo F9: `0c5cbfec07dbaebd59bc7bda190aa5bbc6bb327c` (implementación F9: `40895e4920a40783996aaa6af786c34115dfecfa`).
- F10: [`86c6410974264fa17d4d6bee617f8ebb7c47234e`](https://github.com/juanroblox89-lab/rconceptsys/commit/86c6410974264fa17d4d6bee617f8ebb7c47234e), push confirmado solo en `origin/desde-cero`. `origin/main` quedó en `b0a14a70f73d314d459e73e2cd7c4c7fa769db5b`.
- [Despliegue de código en Vercel](https://vercel.com/juanroblox89-labs-projects/rconceptsys-nuevo/4YPLyzNZz5MDxdzZcai3xgAXYGwR): GitHub confirmó `Deployment has completed`; el check `manuales` también pasó. No se aplicó la 023 ni se hizo una prueba contra el Supabase de producción.

## Qué quedó

- **Crear y editar:** debajo de Especificaciones se adjuntan hasta diez imágenes, videos y audios, con miniatura, póster o reproductor, avance de carga y confirmación Sí/No. El navegador puede grabar audio con MediaRecorder. Si falla una subida, se puede reintentar sin duplicar el trabajo.
- **Detalle:** disponible desde **Ver trabajo**. El admin y el asignado pueden abrir un visor, reproducir y descargar. Go revalida el acceso por cada firma; la descarga vence a los **90 s** y la firma de vista previa a los **300 s**. No se exponen rutas internas en la lista. La edición se mantiene limitada a admins y trabajos pendientes o devueltos.
- **Storage:** el backend valida extensión, contenido y límites de 10 MiB imagen, 50 MiB video y 25 MiB audio. Las partes de 2 MiB pasan por el proxy sin ampliar su límite global de cuerpo. La 023 define un bucket privado, RLS restrictiva para clientes, cupo atómico y cola persistente. Las referencias F9 y el Drive real no se modificaron.
- **Resumen:** opt-in por audio, con estados Resumiendo…, Listo, No se pudo y Reintentar. Salida en español de 3–6 viñetas y transcripción plegable. La cola usa el cron protegido y un reclamo temporal; la IA no toca el archivo original. En los logs solo queda estado y proveedor, no contenido, nombres de archivos ni claves.

## Proveedores

1. **9router · `ag/gemini-3.8-flash` · `input_audio`: verificado.** Sonda de transcripción con WAV sintético generado por la voz del sistema. El adaptador Go cotejó «clips», «color» y «viernes» y recibió 3 viñetas en español (`TestF10SondaGeminiSintetica`, 6,27 s). Se usó el 9router local existente, sin cambiar su configuración. No hubo datos personales.
2. **NVIDIA · `nvidia/parakeet-tdt-0.6b-v3` + respaldo de texto de RIA:** implementado y probado con dobles. La ruta `/v1/audio/transcriptions` y el modelo se eligieron con la [referencia de NVIDIA](https://github.com/NVIDIA/NemoClaw/issues/1520). **No comprobado en vivo**: esta sesión no recibió `NVIDIA_API_KEYS` ni `NVIDIA_API_KEY`. No se abrieron archivos de entorno.

## Verificación

| Prueba | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck` | OK, sin avisos |
| `go build -p 2 ./...`, `go vet -p 2 ./...`, `go test -p 2 -count=1 ./...` | OK |
| [Go: límites, permisos y cola](backend/internal/httpapi/asignacion_adjuntos_test.go) | Tamaños y tipos, rechazo de contenido incorrecto, cupo bajo concurrencia, 401/403, ID de adjunto ajeno, privacidad del detalle, respaldo y fallo total; el archivo queda íntegro y se puede reintentar |
| [Go: firma Storage](backend/internal/supa/asignacion_adjuntos_test.go) | Service role, caducidad, nombre de descarga y rechazo de firma a otro objeto u host, con doble HTTP |
| `npm run mapa`, `node scripts/verificar-ria.mjs`, `git diff --check` | OK; [flujos](docs/arquitectura/flujos.json), [mapa JSON](docs/arquitectura/mapa.json) y [mapa HTML](docs/arquitectura/mapa.html) actualizados |
| [QA Edge headless](scripts/qa-f10.mjs) | 375×812 y 1280×800, ambos temas; grabación con dispositivo sintético, subida de tres medios, fallo y reintento, edición, Sí/No/Escape, visor, descarga, resumen y transcripción. Sin desplazamiento horizontal; tarjetas alineadas a 1280 px. API, estado de IA y medios firmados simulados |
| [Regresión visual F9](scripts/qa-f9.mjs) | OK a 375 px en claro: Picker y referencias al crear, editar y ver como asignado; simulación de organización sin escritura |

No se abrieron ventanas visibles. Hubo un solo servidor de QA oculto por vez en `127.0.0.1:3320`; PIDs **42300**, **20548**, **19072** (tanda final). Sus árboles se cerraron y el puerto quedó libre. No se tocaron `.env*`, `Sensible/` ni `ria_modelo.go`. No se emplearon subagentes.

## Capturas y hashes

[ZIP con 8 PNG y mediciones](CAPTURAS-F10.zip) · [mediciones](capturas-f10/mediciones.json)

| Vista | 375 px claro | 375 px oscuro | 1280 px claro | 1280 px oscuro |
|---|---|---|---|---|
| Formulario | [PNG](capturas-f10/formulario-375-claro.png) | [PNG](capturas-f10/formulario-375-oscuro.png) | [PNG](capturas-f10/formulario-1280-claro.png) | [PNG](capturas-f10/formulario-1280-oscuro.png) |
| Detalle con resumen | [PNG](capturas-f10/detalle-375-claro.png) | [PNG](capturas-f10/detalle-375-oscuro.png) | [PNG](capturas-f10/detalle-1280-claro.png) | [PNG](capturas-f10/detalle-1280-oscuro.png) |

- ZIP SHA-256: `f2b547cd52034257f5c9cee9c69956e50566215d4e718014cf08eba59e7ec0cd`.
- SQL SHA-256: `1c414c3f1f2e4957d3c36f420b6896ef332b36204cbcfabdf52d06cca6bd6678`.

## ESTADO PARA RETOMAR

1. Elías/Juan: confirmar aplicada la 022, luego aplicar [023](supabase/migrations/023_asignaciones_adjuntos.sql) en el entorno autorizado siguiendo [ORDEN](supabase/ORDEN.md). Es idempotente y se dejó en el portapapeles; no se ejecutó.
2. Confirmar que los secretos de Vault de la 018 (`rconcept_cron_url`, `rconcept_cron_secret`) apuntan al entorno correcto y coinciden con `CRON_SECRET` de Go. Configurar las variables de proveedores del [README](README.md#9-adjuntos-de-la-asignación-f10) en ese backend. No enviar audios privados de clientes a un proveedor sin autorización y términos adecuados.
3. En ese entorno, verificar RLS con `anon`/`authenticated`, firma HTTP, descarga/rangos, grabación en un iPhone si aplica y un video próximo a 50 MiB. Con un WAV sintético, verificar la ejecución del cron real y forzar el respaldo NVIDIA en un entorno de prueba. Esto no se declara probado con Supabase/Vercel de producción.
