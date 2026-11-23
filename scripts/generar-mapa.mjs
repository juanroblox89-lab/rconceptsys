#!/usr/bin/env node
/**
 * Generador del mapa de arquitectura de rconceptsys
 * Lee código real y flujos.json, valida referencias, genera mapa.json
 * Uso: node scripts/generar-mapa.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_ARQ = path.join(ROOT, 'docs', 'arquitectura');
const FLUJOS_SRC = path.join(DOCS_ARQ, 'flujos.json');
const MAPA_JSON = path.join(DOCS_ARQ, 'mapa.json');
const MAPA_HTML = path.join(DOCS_ARQ, 'mapa.html');

// Utilidades
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}
function fileExists(file) {
  return fs.existsSync(file);
}
function glob(pattern, base = ROOT) {
  // Simple glob para nuestros casos
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        if (matchPattern(rel, pattern)) files.push(rel);
      }
    }
  }
  walk(base);
  return files;
}
function matchPattern(str, pattern) {
  // Convert glob to regex
  const regex = pattern.split(/(\*\*\/|\*\*|\*)/).map(t => {
    if (t === '**/') return '(?:.*/)?';
    if (t === '**') return '.*';
    if (t === '*') return '[^/]*';
    return escapeRegExp(t);
  }).join('');
  return new RegExp(`^${regex}$`).test(str);
}

// Extraer endpoints de handlers.go
function extraerEndpoints() {
  const handlersPath = path.join(ROOT, 'backend', 'internal', 'httpapi', 'handlers.go');
  if (!fileExists(handlersPath)) return [];
  const content = readFile(handlersPath);
  const endpoints = [];

  const fuentes = glob('backend/internal/httpapi/*.go').filter(f => !f.endsWith('_test.go'));
  const ubicaciones = new Map();
  for (const archivo of fuentes) {
    for (const [, nombre] of readFile(path.join(ROOT, archivo)).matchAll(/func\s*\(a\s*\*API\)\s*(\w+)\s*\(/g)) ubicaciones.set(nombre, archivo);
  }
  const rutas = /mux\.HandleFunc\("([A-Z]+)\s+([^"]+)",\s*(?:a\.MiddlewareAuth\()?a\.(\w+)/g;
  for (const [, metodo, ruta, handler] of content.matchAll(rutas)) {
    const referencia = `${ubicaciones.get(handler) ?? 'backend/internal/httpapi/handlers.go'}:${handler}`;
    endpoints.push({ metodo, ruta, handler: referencia, archivo_funcion: referencia, auth: inferirAuth(content, handler) });
  }
  return endpoints;
}

function inferirAuth(content, handler) {
  // Buscar la línea de mux.HandleFunc para este handler y ver MiddlewareAuth
  const lines = content.split('\n');
  for (const line of lines) {
    if (new RegExp(`\\ba\\.${handler}\\b`).test(line) && line.includes('mux.HandleFunc')) {
      if (line.includes('MiddlewareAuth(a.')) {
        // MiddlewareAuth(a.handleX, true, true) -> requiereAprobado, requiereAdmin
        const args = line.match(/MiddlewareAuth\([^,]+,\s*([^,]+),\s*([^)]+)\)/);
        if (args) {
          const aprobado = args[1].trim() === 'true';
          const admin = args[2].trim() === 'true';
          if (admin) return 'solo_admin';
          if (aprobado) return 'miembros_aprobados';
          return 'cualquiera_autenticado';
        }
      }
      // Sin MiddlewareAuth = público
      if (!line.includes('MiddlewareAuth')) return 'publico';
    }
  }
  return 'desconocido';
}

// Extraer tablas de migraciones
function extraerTablas() {
  const migracionesDir = path.join(ROOT, 'supabase', 'migrations');
  const tablas = [];
  const archivos = fs.readdirSync(migracionesDir).filter(f => f.endsWith('.sql')).sort();

  for (const archivo of archivos) {
    const content = readFile(path.join(migracionesDir, archivo));
    const numMatch = archivo.match(/^(\d+)_/);
    const numero = numMatch ? parseInt(numMatch[1], 10) : 0;

    // Buscar CREATE TABLE
    const tableRegex = /create table if not exists\s+public\.(\w+)/gi;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      const tabla = match[1];
      // Buscar columnas principales
      const cols = extraerColumnas(content, tabla);
      tablas.push({
        nombre: tabla,
        migracion: archivo,
        numero_migracion: numero,
        columnas_principales: cols
      });
    }
  }
  return tablas;
}

function extraerColumnas(content, tabla) {
  // Buscar el bloque CREATE TABLE para esta tabla
  const start = content.toLowerCase().indexOf(`create table if not exists public.${tabla}`);
  if (start === -1) return [];
  const end = content.indexOf(');', start);
  if (end === -1) return [];
  const block = content.slice(start, end + 2);

  const cols = [];
  // Buscar líneas con columnas (simplificado)
  const colRegex = /(\w+)\s+(?:serial|integer|bigint|text|uuid|boolean|timestamptz|date|jsonb|interval)/gi;
  let match;
  while ((match = colRegex.exec(block)) !== null) {
    cols.push(match[1]);
  }
  return [...new Set(cols)].slice(0, 10); // máx 10
}

// Extraer variables de entorno del código
function extraerVariablesEntorno() {
  const vars = new Set();

  // Go: os.Getenv("VAR")
  const goFiles = glob('backend/**/*.go');
  const goRegex = /os\.Getenv\(["']([A-Z0-9_]+)["']\)/g;
  for (const f of goFiles) {
    const content = readFile(path.join(ROOT, f));
    let match;
    while ((match = goRegex.exec(content)) !== null) {
      vars.add(match[1]);
    }
  }

  // TypeScript/JS: process.env.VAR o process.env["VAR"]
  const tsFiles = glob('app/**/*.ts', ROOT);
  const tsFiles2 = glob('lib/**/*.ts', ROOT);
  const tsFiles3 = glob('scripts/**/*.mjs', ROOT);
  const allTs = [...tsFiles, ...tsFiles2, ...tsFiles3];
  const tsRegex = /process\.env\.([A-Z0-9_]+)/g;
  const tsRegex2 = /process\.env\[["']([A-Z0-9_]+)["']\]/g;
  for (const f of allTs) {
    const content = readFile(path.join(ROOT, f));
    let match;
    while ((match = tsRegex.exec(content)) !== null) vars.add(match[1]);
    while ((match = tsRegex2.exec(content)) !== null) vars.add(match[1]);
  }

  return Array.from(vars).sort();
}

// Validar que archivo:función existe
function validarArchivoFuncion(archivoFuncion) {
  const parts = archivoFuncion.split(':');
  if (parts.length < 2) {
    // No tiene formato archivo:funcion, solo verificar que el archivo existe
    const fullPath = path.join(ROOT, archivoFuncion);
    if (!fileExists(fullPath)) {
      return { ok: false, error: `Archivo no existe: ${archivoFuncion}` };
    }
    return { ok: true };
  }
  const [archivo, funcion] = parts;
  const fullPath = path.join(ROOT, archivo);
  if (!fileExists(fullPath)) {
    return { ok: false, error: `Archivo no existe: ${archivo}` };
  }
  const content = readFile(fullPath);
  const ext = path.extname(archivo).toLowerCase();

  if (ext === '.go') {
    // Go: func (receiver) NombreFuncion(...) o func NombreFuncion(...)
    // También métodos: func (a *API) NombreFuncion
    // También métodos de interfaz (sin func): NombreFuncion(...) [return_type]
    const patterns = [
      new RegExp(`func\\s*\\([^)]*\\)\\s*${escapeRegExp(funcion)}\\s*\\(`),
      new RegExp(`^func\\s+${escapeRegExp(funcion)}\\s*\\(`, 'm'),
      new RegExp(`func\\s+${escapeRegExp(funcion)}\\s*\\(`),
      new RegExp(`${escapeRegExp(funcion)}\\s*\\([^)]*\\)\\s*[\\{,(]`) // método de interfaz o firma (también return type)
    ];
    for (const pat of patterns) {
      if (pat.test(content)) return { ok: true };
    }
    // Interfaz: NombreFuncion(...) sin func - permite return type y fin de línea
    if (new RegExp(`^\\s*${escapeRegExp(funcion)}\\s*\\([^)]*\\)\\s*([\\w\\[\\]<>,* ]+)?\\s*$`, 'm').test(content)) {
      return { ok: true };
    }
    return { ok: false, error: `Función ${funcion} no encontrada en ${archivo}` };
  }

  if (ext === '.ts' || ext === '.tsx') {
    // TypeScript: export function nombre, const nombre =, function nombre, async function nombre
    // También métodos de clase: nombre() {, async nombre() {
    // También generics: nombre<T>(...) {
    const patterns = [
      new RegExp(`(^|\\s)(export\\s+)?(async\\s+)?function\\s+${escapeRegExp(funcion)}\\s*<[^>]*>\\s*\\(`),
      new RegExp(`(^|\\s)(export\\s+)?(async\\s+)?function\\s+${escapeRegExp(funcion)}\\s*\\(`),
      new RegExp(`(^|\\s)(export\\s+)?const\\s+${escapeRegExp(funcion)}\\s*=`),
      new RegExp(`(^|\\s)(async\\s+)?${escapeRegExp(funcion)}\\s*<[^>]*>\\s*\\([^)]*\\)\\s*[\\{:]`),
      new RegExp(`(^|\\s)(async\\s+)?${escapeRegExp(funcion)}\\s*\\([^)]*\\)\\s*[\\{:]`),
      new RegExp(`${escapeRegExp(funcion)}\\s*\\([^)]*\\)\\s*\\{`) // método simple
    ];
    for (const pat of patterns) {
      if (pat.test(content)) return { ok: true };
    }
    return { ok: false, error: `Función ${funcion} no encontrada en ${archivo}` };
  }

  if (ext === '.sql') {
    // SQL: CREATE OR REPLACE FUNCTION nombre(...) o CREATE FUNCTION nombre(...)
    // El nombre de la función puede tener parámetros en la definición, pero el nombre corto es antes de (
    const patterns = [
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${escapeRegExp(funcion)}\\s*\\(`, 'i'),
      new RegExp(`function\\s+${escapeRegExp(funcion)}\\s*\\(`, 'i'),
      new RegExp(`${escapeRegExp(funcion)}\\s*\\(`, 'i') // por si acaso
    ];
    for (const pat of patterns) {
      if (pat.test(content)) return { ok: true };
    }
    return { ok: false, error: `Función ${funcion} no encontrada en ${archivo}` };
  }

  if (ext === '.md') {
    // Markdown: solo verificar que el archivo existe
    return { ok: true };
  }

  // Por defecto: búsqueda simple
  if (content.includes(funcion)) return { ok: true };
  return { ok: false, error: `Función ${funcion} no encontrada en ${archivo}` };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Validar todos los pasos de flujos
function validarFlujos(flujos) {
  const errores = [];
  const advertencias = [];

  for (const flujo of flujos) {
    for (const paso of flujo.pasos) {
      if (paso.archivo_funcion) {
        const resultado = validarArchivoFuncion(paso.archivo_funcion);
        if (!resultado.ok) {
          errores.push(`Flujo "${flujo.nombre}" paso ${paso.orden}: ${resultado.error}`);
        }
      }
      // También validar archivo_funcion_extra si existe
      if (paso.archivo_funcion_extra) {
        const resultado = validarArchivoFuncion(paso.archivo_funcion_extra);
        if (!resultado.ok) {
          advertencias.push(`Flujo "${flujo.nombre}" paso ${paso.orden} (extra): ${resultado.error}`);
        }
      }
    }
  }

  return { errores, advertencias };
}

// Módulos del sistema
function obtenerModulos() {
  return [
    {
      id: 'next',
      nombre: 'Next.js (app/)',
      descripcion: 'Frontend React 19 + Next.js 16, App Router, Server Components, proxy /api/* → Go',
      archivos_clave: [
        'app/layout.tsx',
        'app/(app)/layout.tsx',
        'app/api/[...path]/route.ts',
        'app/(app)/page.tsx',
        'app/(app)/tareas/page.tsx',
        'app/(app)/asignaciones/page.tsx',
        'app/(app)/ria/page.tsx',
        'app/(app)/chat.module.css',
        'lib/ria.ts',
        'lib/api.ts',
        'next.config.ts'
      ],
      tipo: 'frontend'
    },
    {
      id: 'go',
      nombre: 'Go Backend (backend/)',
      descripcion: 'API HTTP en Go (stdlib net/http), service_role Supabase, store interface (memoria/Supabase)',
      archivos_clave: [
        'backend/cmd/server/main.go',
        'backend/internal/httpapi/handlers.go',
        'backend/internal/httpapi/auth.go',
        'backend/internal/httpapi/notificaciones.go',
        'backend/internal/httpapi/notificaciones_eventos.go',
        'backend/internal/httpapi/push.go',
        'backend/internal/httpapi/ria.go',
        'backend/internal/httpapi/ria_modelo.go',
        'backend/internal/httpapi/drive.go',
        'backend/internal/httpapi/flujo.go',
        'backend/internal/store/store.go',
        'backend/internal/store/notificaciones.go',
        'backend/internal/store/ria.go',
        'backend/internal/store/drive_oauth.go',
        'backend/internal/supa/store.go',
        'backend/internal/supa/client.go',
        'backend/internal/supa/notificaciones.go',
        'backend/internal/supa/ria.go',
        'backend/go.mod'
      ],
      tipo: 'backend'
    },
    {
      id: 'supabase',
      nombre: 'Supabase (PostgreSQL + Auth + Storage + Realtime)',
      descripcion: 'Base de datos, autenticación, storage, realtime, pg_cron, pg_net, Vault',
      archivos_clave: [
        'supabase/migrations/001_f0_base_y_chat.sql',
        'supabase/migrations/002_endurecer_permisos.sql',
        'supabase/migrations/003_trabajos_tareas_facturas.sql',
        'supabase/migrations/004_minutos_clientes_estadisticas.sql',
        'supabase/migrations/005_enlace_medios_tareas.sql',
        'supabase/migrations/006_equipo_y_adjuntos_chat.sql',
        'supabase/migrations/007_asignaciones_vistas.sql',
        'supabase/migrations/008_drive_conexion.sql',
        'supabase/migrations/009_clientes_piezas.sql',
        'supabase/migrations/010_cortes_pago.sql',
        'supabase/migrations/011_push_suscripciones.sql',
        'supabase/migrations/012_clientes_flujo.sql',
        'supabase/migrations/013_notificaciones.sql',
        'supabase/migrations/014_ria.sql',
        'supabase/migrations/015_apariencia.sql',
        'supabase/migrations/016_celular.sql',
        'supabase/migrations/017_drive_oauth.sql',
        'supabase/migrations/018_cron_notificaciones_pg_cron.sql'
      ],
      tipo: 'database'
    },
    {
      id: 'vercel',
      nombre: 'Vercel (Web + API + Cron diario)',
      descripcion: 'Despliegue: servicio "web" (Next.js) + servicio "api" (Go) vinculados por BACKEND_URL; cron diario 13:00 UTC',
      archivos_clave: [
        'vercel.json'
      ],
      tipo: 'infraestructura'
    },
    {
      id: 'pg_cron_pg_net',
      nombre: 'pg_cron + pg_net (cron cada minuto)',
      descripcion: 'Extensiones de Supabase: job pg_cron cada minuto llama a net.http_get hacia /api/cron/notificaciones con secretos del Vault',
      archivos_clave: [
        'supabase/migrations/018_cron_notificaciones_pg_cron.sql'
      ],
      tipo: 'infraestructura'
    },
    {
      id: 'google_drive',
      nombre: 'Google Drive (conector equipo)',
      descripcion: 'Una cuenta OAuth del equipo; backend crea subcarpetas por tarea y copia entregas; refresh_token guardado en BD (solo service_role)',
      archivos_clave: [
        'backend/internal/httpapi/drive.go',
        'backend/internal/store/drive_oauth.go',
        'backend/internal/supa/store.go (ObtenerConexionDrive)',
        'supabase/migrations/008_drive_conexion.sql',
        'supabase/migrations/017_drive_oauth.sql'
      ],
      tipo: 'externo'
    },
    {
      id: 'web_push',
      nombre: 'Web Push (VAPID)',
      descripcion: 'Push notifications cifradas RFC 8291/8292; suscripciones en push_suscripciones; cola en notificaciones; envío inmediato + cron cada minuto',
      archivos_clave: [
        'backend/internal/httpapi/push.go',
        'backend/internal/httpapi/notificaciones.go',
        'backend/internal/supa/notificaciones.go',
        'supabase/migrations/011_push_suscripciones.sql',
        'supabase/migrations/013_notificaciones.sql'
      ],
      tipo: 'externo'
    },
    {
      id: 'ria',
      nombre: 'RIA (9router + respaldo NVIDIA)',
      descripcion: 'Asistente IA: principal vía 9router (ag/claude-sonnet-5-5-low), respaldo directo a NVIDIA (nemotron-3.5-super-vl-120b-a12b) con round-robin de claves; streaming SSE; tope diario; chat equipo (@RIA) y privado (/ria)',
      archivos_clave: [
        'backend/internal/httpapi/ria.go',
        'backend/internal/httpapi/ria_modelo.go',
        'backend/internal/httpapi/handlers.go (handleRIA)',
        'backend/internal/store/ria.go',
        'backend/internal/supa/ria.go',
        'supabase/migrations/014_ria.sql',
        'lib/ria.ts',
        'app/(app)/ria/page.tsx',
        'docs/ria/configuracion-nvidia.md'
      ],
      tipo: 'ia'
    }
  ];
}

// Reglas del proyecto
function obtenerReglas() {
  return [
    'main = producción (rama protegida, no se hace push directo)',
    'push solo a rama desde-cero',
    'sin push --force, sin reset --hard, sin stash',
    'migraciones NO se aplican desde el agente (las aplica Juan en Supabase Dashboard)',
    'no tocar .env* ni Sensible\\',
    'variables de entorno solo por nombre en documentación (nunca valores)',
    'todo brief futuro termina con el paso "regenerar mapa.json" (npm run mapa)',
    'código real únicamente: nada inventado; si no se confirma en código, marcar "sin confirmar"',
    'commits claros en español',
    'verificación: npm run mapa sin errores, tsc/lint si se toca código afectado, capturas 375 y 1280px sin desbordes ni errores de consola'
  ];
}

// Archivos clave por módulo (para agentes)
function obtenerArchivosClave() {
  return {
    next: [
      'app/layout.tsx',
      'app/(app)/layout.tsx',
      'app/api/[...path]/route.ts',
      'app/(app)/page.tsx',
      'app/(app)/tareas/page.tsx',
      'app/(app)/asignaciones/page.tsx',
      'app/(app)/ria/page.tsx',
      'app/(app)/chat.module.css',
      'lib/ria.ts',
      'lib/api.ts',
      'next.config.ts'
    ],
    go: [
      'backend/cmd/server/main.go',
      'backend/internal/httpapi/handlers.go',
      'backend/internal/httpapi/auth.go',
      'backend/internal/httpapi/notificaciones.go',
      'backend/internal/httpapi/notificaciones_eventos.go',
      'backend/internal/httpapi/push.go',
      'backend/internal/httpapi/ria.go',
      'backend/internal/httpapi/ria_modelo.go',
      'backend/internal/httpapi/drive.go',
      'backend/internal/httpapi/flujo.go',
      'backend/internal/store/store.go',
      'backend/internal/store/notificaciones.go',
      'backend/internal/store/ria.go',
      'backend/internal/store/drive_oauth.go',
      'backend/internal/supa/store.go',
      'backend/internal/supa/client.go',
      'backend/internal/supa/notificaciones.go',
      'backend/internal/supa/ria.go',
      'backend/go.mod'
    ],
    supabase: [
      'supabase/migrations/001_f0_base_y_chat.sql',
      'supabase/migrations/002_endurecer_permisos.sql',
      'supabase/migrations/003_trabajos_tareas_facturas.sql',
      'supabase/migrations/004_minutos_clientes_estadisticas.sql',
      'supabase/migrations/005_enlace_medios_tareas.sql',
      'supabase/migrations/006_equipo_y_adjuntos_chat.sql',
      'supabase/migrations/007_asignaciones_vistas.sql',
      'supabase/migrations/008_drive_conexion.sql',
      'supabase/migrations/009_clientes_piezas.sql',
      'supabase/migrations/010_cortes_pago.sql',
      'supabase/migrations/011_push_suscripciones.sql',
      'supabase/migrations/012_clientes_flujo.sql',
      'supabase/migrations/013_notificaciones.sql',
      'supabase/migrations/014_ria.sql',
      'supabase/migrations/015_apariencia.sql',
      'supabase/migrations/016_celular.sql',
      'supabase/migrations/017_drive_oauth.sql',
      'supabase/migrations/018_cron_notificaciones_pg_cron.sql'
    ],
    vercel: ['vercel.json'],
    pg_cron_pg_net: ['supabase/migrations/018_cron_notificaciones_pg_cron.sql'],
    google_drive: [
      'backend/internal/httpapi/drive.go',
      'backend/internal/store/drive_oauth.go',
      'supabase/migrations/008_drive_conexion.sql',
      'supabase/migrations/017_drive_oauth.sql'
    ],
    web_push: [
      'backend/internal/httpapi/push.go',
      'backend/internal/httpapi/notificaciones.go',
      'backend/internal/supa/notificaciones.go',
      'supabase/migrations/011_push_suscripciones.sql',
      'supabase/migrations/013_notificaciones.sql'
    ],
    ria: [
      'backend/internal/httpapi/ria.go',
      'backend/internal/httpapi/ria_modelo.go',
      'backend/internal/store/ria.go',
      'backend/internal/supa/ria.go',
      'supabase/migrations/014_ria.sql',
      'lib/ria.ts',
      'app/(app)/ria/page.tsx',
      'docs/ria/configuracion-nvidia.md'
    ]
  };
}

// Generar mapa.json completo
async function generarMapa() {
  console.log('📖 Leyendo flujos.json...');
  const flujosData = readJSON(FLUJOS_SRC);
  const flujos = flujosData.flujos;

  console.log('🔍 Validando referencias archivo:función en flujos...');
  const { errores, advertencias } = validarFlujos(flujos);
  if (errores.length > 0) {
    console.error('❌ ERRORES de validación:');
    for (const e of errores) console.error('  -', e);
    process.exit(1);
  }
  if (advertencias.length > 0) {
    console.warn('⚠️ Advertencias:');
    for (const w of advertencias) console.warn('  -', w);
  }
  console.log('✅ Validación OK');

  console.log('📡 Extrayendo endpoints de handlers.go...');
  const endpoints = extraerEndpoints();
  console.log(`  ${endpoints.length} endpoints encontrados`);

  console.log('🗄️ Extrayendo tablas de migraciones...');
  const tablas = extraerTablas();
  console.log(`  ${tablas.length} tablas encontradas`);

  console.log('🔐 Extrayendo variables de entorno...');
  const variablesEntorno = extraerVariablesEntorno();
  console.log(`  ${variablesEntorno.length} variables encontradas`);

  console.log('🧩 Construyendo módulos...');
  const modulos = obtenerModulos();

  console.log('📋 Obteniendo reglas...');
  const reglas = obtenerReglas();

  console.log('📁 Archivos clave...');
  const archivosClave = obtenerArchivosClave();

  const mapa = {
    generado_en: new Date().toISOString(),
    version: '1.0',
    modulos,
    endpoints,
    tablas,
    variables_entorno: variablesEntorno,
    flujos,
    reglas_proyecto: reglas,
    archivos_clave: archivosClave
  };

  console.log(`💾 Escribiendo ${MAPA_JSON}...`);
  writeJSON(MAPA_JSON, mapa);
  console.log('✅ mapa.json generado correctamente');

  // Generar mapa.html con datos embebidos
  console.log('🌐 Generando mapa.html...');
  await generarMapaHTML(mapa, flujosData);
  console.log('✅ mapa.html generado correctamente');

  return mapa;
}

async function generarMapaHTML(mapa, flujosData) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  let html = await readFile(MAPA_HTML, 'utf8');
  let commitHash = '';
  try { commitHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim(); } catch { /* sin git */ }
  const datos = commitHash ? { ...mapa, commit_hash: commitHash } : mapa;
  writeJSON(MAPA_JSON, datos);
  const seguro = obj => JSON.stringify(obj).replaceAll('<', '\\u003c');
  for (const [nombre, valor] of [['MAPA_DATA', datos], ['FLUJOS_DATA', flujosData]]) {
    const patron = new RegExp(`^const ${nombre} = [^\\r\\n]+;$`, 'm');
    if (!patron.test(html)) throw new Error(`No se encontró ${nombre} en mapa.html`);
    html = html.replace(patron, () => `const ${nombre} = ${seguro(valor)};`);
  }
  await writeFile(MAPA_HTML, html, 'utf8');
}

// Ejecutar
try {
  await generarMapa();
} catch (err) {
  console.error('❌ Error fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
}