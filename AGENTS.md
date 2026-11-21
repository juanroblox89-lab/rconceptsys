<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# rconceptsys — Reglas de agente

## Mapa de arquitectura (docs/arquitectura/)

**Regla obligatoria:** Cada vez que se modifique `docs/arquitectura/flujos.json` o cualquier archivo que el generador valida (`archivo:función` en `.go`, `.ts`, `.tsx`, `.sql`, `.md`), **debe ejecutarse** `npm run mapa` para regenerar `mapa.json` y `mapa.html`.

- El generador está en `scripts/generar-mapa.mjs`
- Valida referencias `archivo:función` contra código real
- Si la validación falla, el script termina con código 1
- No commitear cambios en flujos sin regenerar el mapa

## Rama y Git

- Rama de trabajo: `desde-cero`
- Push **solo** a `desde-cero`, nunca a `main`
- Commits en español, claros y atómicos
- No force-push, no reset, no stash

## Archivos prohibidos

- No tocar `.env*` ni `Sensible\`.
- Al cerrar cada brief que cambie flujos, endpoints o tablas: actualizar `docs/arquitectura/flujos.json` y correr `npm run mapa`.

## Verificación

- `npm run mapa` debe pasar sin errores
- `npm run lint` y `npm run typecheck` limpios
- Si se levanta servidor de verificación: **máximo 1** a la vez