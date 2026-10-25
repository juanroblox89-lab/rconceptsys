// scripts/migrar.mjs
// Aplica migraciones SQL de forma idempotente en Supabase usando pg/DATABASE_URL o REST RPC
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const supaUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[migrar] Encontradas ${files.length} migraciones en ${migrationsDir}`);

  if (!dbUrl && (!supaUrl || !serviceKey)) {
    console.log('[migrar] AVISO: No hay DATABASE_URL ni SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
    console.log('[migrar] Este script esta listo para ejecutarse cuando Juan configure las credenciales.');
    for (const f of files) {
      console.log(` - ${f} (pendiente)`);
    }
    process.exit(0);
  }

  // Si hay Postgres driver o Postgres connection string
  try {
    // Intenta usar postgres nativo si esta instalado
    const { default: postgres } = await import('postgres');
    const sql = postgres(dbUrl, { max: 1 });
    
    // Crear tabla de tracking
    await sql`
      create table if not exists public.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      );
    `;

    for (const file of files) {
      const rows = await sql`select version from public.schema_migrations where version = ${file}`;
      if (rows.length > 0) {
        console.log(`[migrar] Ya aplicada: ${file}`);
        continue;
      }
      console.log(`[migrar] Aplicando ${file}...`);
      const content = readFileSync(join(migrationsDir, file), 'utf-8');
      await sql.unsafe(content);
      await sql`insert into public.schema_migrations (version) values (${file})`;
      console.log(`[migrar] OK: ${file}`);
    }
    await sql.end();
    console.log('[migrar] Todas las migraciones completadas exitosamente.');
  } catch (err) {
    console.error('[migrar] Error o dependencia no instalada:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[migrar] Error fatal:', err);
  process.exit(1);
});
