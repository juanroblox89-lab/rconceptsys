# Reporte F6 · rconceptsys

Rama `desde-cero`. Verificación local con Next y API Go en modo demo, sin datos reales. No se aplicaron migraciones ni se modificó producción.

| Fase | Cambios y evidencia |
|---|---|
| 1 · Trabajos y Clientes | Formulario compartido, cliente y fecha obligatorios, alta de cliente sin perder borrador, edición de trabajos abiertos, carpeta bajo el cliente, ficha y entrega destacada. Pruebas visuales a 375 y 1280 px, en claro y oscuro. [Salida](capturas-f6/verificacion-f1.log). |
| 2 · Notificaciones | Bandeja privada, contador, lectura, enlaces directos, preferencias, agrupación, silencio en hora de Bogotá y excepción de menciones. Cola de push con reintentos y registro por dispositivo. El cron encola vencimientos y consulta el cursor de Drive. Playwright verificó bandeja, mención, preferencias y destino Drive. [Salida](capturas-f6/verificacion-f2.log). |
| 3 · RIA | Chat de equipo con `@RIA` y chat privado con historial, Ayuda con pregunta inicial, contexto filtrado en el servidor y manuales por rol. SSE real con proveedor simulado: dos estados intermedios en cada chat a 375 y 1280 px, en claro y oscuro. Pruebas de permisos, timeout, 503, 530 y rotación por 429/5xx. La documentación se verifica en el build y en Go. [Salida](capturas-f6/verificacion-f3.log). |
| 4 · Apariencia | Menú ordenado, modo y tema por cuenta, vista previa, colores, tamaño, contraste y movimiento. Glass con fondo propio: reproducción de MP4 en escritorio y solo primer fotograma en móvil, verificados localmente. [Salida](capturas-f6/verificacion-f4.log). |
| 5 · Celular | Campo obligatorio en el registro y puerta de primera entrada para cuentas sin número. +57 inicial, validación según indicativo y edición en Perfil y Configuración. Playwright comprobó formatos y que el número no aparece en el directorio. [Salida](capturas-f6/verificacion-f5.log). |
| 6 · Escala y movimiento | A 1920 px: barra izquierda 290 px, Equipo 330 px. Burbujas de 16 px, caja de escritura más alta e iconos laterales de 20 px. Se verificaron barra abierta/colapsada, movimiento reducido, y 0 px de desborde a 375 y 1280 px. [Salida](capturas-f6/verificacion-f6.log). |
| 7 · Equipo y retorno Drive | PostgREST devuelve UUID para los perfiles; el contador ya no los decodifica como enteros. El retorno da prioridad a `GOOGLE_REDIRECT_URI`; en su ausencia, usa el host público transmitido por Next, no el host interno. El estado OAuth es de un solo uso, se guarda en el almacén y conserva el retorno entre instancias. Pruebas locales de conteo y URL pública. [Salida final](capturas-f6/verificacion-f7.log). |

## RIA y configuración de Vercel

- Principal: Claude Sonnet 5.5 con esfuerzo `low` por 9router. Respaldo directo e independiente: `https://integrate.api.nvidia.com/v1`, modelo `nvidia/nemotron-3.5-super-vl-120b-a12b`, confirmado en la [referencia oficial de NVIDIA](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b/apireference). La elección conserva el modelo solicitado y usa el identificador de la API directa, sin el prefijo adicional de 9router.
- Variables de RIA: `NINEROUTER_BASE_URL`, `NINEROUTER_API_KEY`, `NVIDIA_API_KEY`, `NVIDIA_API_KEYS`, `RIA_MODELO_RESPALDO`, `ASISTENTE_TOPE_DIA`. `NVIDIA_API_KEYS` acepta claves separadas por comas; `NVIDIA_API_KEY` funciona sola o se añade sin duplicados. La clave inicial rota por instancia. Si una falla con 429, 5xx o timeout antes del primer fragmento, se prueba la siguiente, sin mostrar ni registrar las claves. Los servidores simulados cubren estos casos, el agotamiento de la lista y el uso de una sola clave. Consulta la [configuración de NVIDIA para RIA](docs/ria/configuracion-nvidia.md).
- Cron: `CRON_SECRET`. Push: `VAPID_CLAVE_PUBLICA`, `VAPID_CLAVE_PRIVADA`, `VAPID_ASUNTO`. Drive: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_DRIVE_CARPETA_RAIZ`.
- El cron nativo no se ejecuta en preview y [el intervalo de un minuto requiere Vercel Pro o Enterprise](https://vercel.com/docs/cron-jobs/usage-and-pricing). En preview se comprueba invocando manualmente `/api/cron/notificaciones` con el secreto configurado.

## Migraciones · no aplicadas

Aplicar en este orden sobre una base con las migraciones 001–011. Primero en una base de prueba separada.

1. [012_clientes_flujo.sql](supabase/migrations/012_clientes_flujo.sql): logo y carpetas del cliente.
2. [013_notificaciones.sql](supabase/migrations/013_notificaciones.sql): bandeja, cola, preferencias y cursor.
3. [014_ria.sql](supabase/migrations/014_ria.sql): historial privado, cupo y autoría de RIA.
4. [015_apariencia.sql](supabase/migrations/015_apariencia.sql): apariencia y bucket privado.
5. [016_celular.sql](supabase/migrations/016_celular.sql): celular privado y validación de almacenamiento.
6. [017_drive_oauth.sql](supabase/migrations/017_drive_oauth.sql): estado de retorno de un solo uso.

## Preview de Vercel

El push terminó correctamente en `desde-cero` (`2ffc808`). El [despliegue de preview](https://vercel.com/juanroblox89-labs-projects/rconceptsys-nuevo/5GRBoLskc7HgVrmUnhpneURnTpME) quedó en `ERROR` antes de compilar: Vercel confirmó que el proyecto está en Hobby y solo admite cron diario. Se conservó `* * * * *` como pide el brief. Para desplegar sin cambiar esa frecuencia se necesita Pro o Enterprise; no se cambió el plan ni se tocó `main`.

## Evidencia y pendientes

- Los `.log` enlazados conservan la salida real de `tsc`, lint, `next build`, `go vet` y `go test`. La última ronda los pasó todos. Los PNG y recorridos reproducibles están en `capturas-f6/`.
- Pendientes con servicios reales: aplicar y probar SQL en una base de prueba, push en dispositivos reales (incluidos TWA e iPhone instalado), cambios de Drive y autorización real de Google, cron de Vercel, túnel 9router y confirmación autenticada de NVIDIA con `GET /v1/models`. Los resultados locales no acreditan esos servicios.

## Cambio de cron (21 nov, decisión de Juan: opción gratis)

- `vercel.json`: cron diario `0 13 * * *` (compatible con Hobby).
- Migración nueva `supabase/migrations/018_cron_notificaciones_pg_cron.sql`: pg_cron + pg_net llaman cada minuto a `/api/cron/notificaciones` con el secreto leído de Vault (`rconcept_cron_url`, `rconcept_cron_secret`, que carga Juan; el archivo no los contiene). Orden: después de 017.
- Los avisos se envían al momento del evento (envío inmediato tras encolar, tope 4 s); el cron solo reintenta, revisa Drive y manda los "vence mañana". Pendiente probar contra Supabase y Vercel reales.
