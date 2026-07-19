import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://msqirtllobfdgxuqbojk.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MjA2NywiZXhwIjoyMDk5NTE4MDY3fQ.w50J1ZwvZJJUkaDcn_gbTDTENKgMosXyGc7_fbNKogc';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrateIdentities() {
  console.log('=== FASE E: Identidad (Fix #12) ===\n');
  console.log('Estandarizando employeeId para usar PostgreSQL UUID (id) en lugar de Firebase UID (uid)...\n');

  // 1. Get all users to build a mapping from uid -> id
  const { data: users, error: userErr } = await supabase.from('users').select('id, uid');
  if (userErr) {
    console.error('Error fetching users:', userErr);
    return;
  }

  const uidToId = {};
  for (const u of users) {
    if (u.uid && u.id && u.uid !== u.id) {
      uidToId[u.uid] = u.id;
    }
  }

  console.log(`Encontrados ${Object.keys(uidToId).length} usuarios con id ≠ uid (migrados de Firebase).\n`);

  if (Object.keys(uidToId).length === 0) {
    console.log('No hay usuarios que requieran migración. Todos usan id === uid.');
    return;
  }

  // Helper to migrate a table
  async function migrateTable(tableName, idColumn = 'id') {
    console.log(`Migrando tabla: ${tableName}...`);
    const { data: records, error } = await supabase.from(tableName).select(`${idColumn}, "employeeId"`);
    if (error) {
      console.warn(`  No se pudo leer ${tableName} (puede que no tenga employeeId).`);
      return;
    }

    let updated = 0;
    for (const record of records) {
      if (record.employeeId && uidToId[record.employeeId]) {
        const newId = uidToId[record.employeeId];
        const { error: updateErr } = await supabase
          .from(tableName)
          .update({ employeeId: newId })
          .eq(idColumn, record[idColumn]);
        
        if (!updateErr) updated++;
      }
    }
    console.log(`  ✅ ${updated} registros actualizados en ${tableName}.`);
  }

  await migrateTable('assignments');
  await migrateTable('invoices');
  await migrateTable('admin_invoices');
  await migrateTable('marketing_visits'); // Note: marketing_visits uses userId? No, employeeId per code

  // marketing_visits might use employeeId
  // chats use userId
  console.log(`\nMigrando tabla: chats (userId)...`);
  const { data: chats, error: chatsErr } = await supabase.from('chats').select('id, "userId"');
  if (!chatsErr) {
    let chatsUpdated = 0;
    for (const chat of chats) {
      if (chat.userId && uidToId[chat.userId]) {
        await supabase.from('chats').update({ userId: uidToId[chat.userId] }).eq('id', chat.id);
        chatsUpdated++;
      }
    }
    console.log(`  ✅ ${chatsUpdated} registros actualizados en chats.`);
  }

  // sop_submissions use userId
  console.log(`\nMigrando tabla: sop_submissions (userId)...`);
  const { data: sops, error: sopsErr } = await supabase.from('sop_submissions').select('id, "userId"');
  if (!sopsErr) {
    let sopsUpdated = 0;
    for (const sop of sops) {
      if (sop.userId && uidToId[sop.userId]) {
        await supabase.from('sop_submissions').update({ userId: uidToId[sop.userId] }).eq('id', sop.id);
        sopsUpdated++;
      }
    }
    console.log(`  ✅ ${sopsUpdated} registros actualizados en sop_submissions.`);
  }

  console.log('\n=== Migración Completada ===');
}

migrateIdentities().catch(console.error);
