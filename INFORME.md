# Informe · F6 de rconceptsys

Los siete bloques quedaron implementados en `desde-cero`, con commits por fase. Las comprobaciones locales de TypeScript, ESLint, Next, `go vet` y `go test` pasaron. Se verificaron los recorridos principales a 375 y 1280 px; el chat también se midió a 1920 px.

- [Reporte completo](HARNESS-REPORTE-F6.md): alcance, resultados, variables de Vercel y pruebas pendientes.
- [Orden y SQL de las migraciones](supabase/ORDEN.md): archivos 012–017, listos para revisión. No se aplicaron.
- [Salida final de las pruebas](capturas-f6/verificacion-f7.log).

El streaming, Web Push, Drive, Supabase y cron no se dan por comprobados con servicios reales. Para RIA se verificaron los fragmentos SSE y, con servidores simulados, la rotación de `NVIDIA_API_KEYS`, los reintentos por 429, 5xx y timeout, y la compatibilidad con `NVIDIA_API_KEY` sola. Consulta la [configuración del respaldo](docs/ria/configuracion-nvidia.md). No se modificó `main` ni se publicó en producción.

**Preview bloqueado:** el push a `desde-cero` se completó (`2ffc808`). [Vercel rechazó el despliegue](https://vercel.com/juanroblox89-labs-projects/rconceptsys-nuevo/5GRBoLskc7HgVrmUnhpneURnTpME) antes de compilar: Hobby solo admite cron diario. Se conservó el cron de un minuto del brief; para desplegarlo tal cual se requiere Pro o Enterprise. No se cambió el plan.