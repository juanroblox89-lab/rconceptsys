import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://msqirtllobfdgxuqbojk.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zcWlydGxsb2JmZGd4dXFib2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MjA2NywiZXhwIjoyMDk5NTE4MDY3fQ.w50J1ZwvZJJUkaDcn_gbTDTENKgMosXyGc7_fbNKogc';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrate() {
  console.log('=== FASE A: SQL Migrations ===\n');

  // FIX #1: Check sop_submissions table
  console.log('[#1] Checking sop_submissions table...');
  const { error: checkErr } = await supabase.from('sop_submissions').select('id').limit(1);
  
  if (checkErr && checkErr.message.includes('does not exist')) {
    console.log('  ❌ Table does not exist');
  } else {
    console.log('  ✅ Table exists');
  }

  // FIX #2: Check missing columns on users
  console.log('\n[#2] Checking users columns...');
  const columns = ['allowedClients', 'marketingVisits', 'fcmToken', 'fcmTokenUpdatedAt', 'platform'];
  const missing = [];
  
  for (const col of columns) {
    const { error } = await supabase.from('users').select(`"${col}"`).limit(1);
    if (error && error.message.includes('does not exist')) {
      missing.push(col);
      console.log(`  ❌ ${col} — MISSING`);
    } else {
      console.log(`  ✅ ${col} — exists`);
    }
  }

  // Try to create missing structures via Management API
  if (checkErr || missing.length > 0) {
    console.log('\n--- Attempting SQL execution via Management API ---');
    
    let sql = '';
    
    if (checkErr && checkErr.message.includes('does not exist')) {
      sql += `
CREATE TABLE IF NOT EXISTS public.sop_submissions (
  id text PRIMARY KEY,
  "sopId" text NOT NULL,
  "userId" text NOT NULL,
  "userName" text,
  "sopTitle" text,
  status text DEFAULT 'active',
  steps jsonb DEFAULT '[]'::jsonb,
  "assignmentId" text,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

ALTER TABLE public.sop_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sop_submissions" ON public.sop_submissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated write sop_submissions" ON public.sop_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
`;
    }
    
    if (missing.includes('allowedClients')) {
      sql += `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "allowedClients" jsonb DEFAULT '[]'::jsonb;\n`;
    }
    if (missing.includes('marketingVisits')) {
      sql += `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "marketingVisits" integer DEFAULT 0;\n`;
    }
    if (missing.includes('fcmToken')) {
      sql += `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "fcmToken" text;\n`;
    }
    if (missing.includes('fcmTokenUpdatedAt')) {
      sql += `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "fcmTokenUpdatedAt" timestamptz;\n`;
    }
    if (missing.includes('platform')) {
      sql += `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS platform text;\n`;
    }

    console.log('\nSQL to execute:\n' + sql);

    // Attempt via Supabase Management API (requires service role)
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql }),
      });
      
      if (resp.ok) {
        console.log('✅ SQL executed via RPC');
      } else {
        const body = await resp.text();
        console.log(`❌ RPC failed (${resp.status}): ${body}`);
        console.log('\n⚠️  MANUAL ACTION REQUIRED: Copy the SQL above and run it in Supabase SQL Editor');
        console.log(`   URL: ${SUPABASE_URL.replace('.co', '.co')}/project/msqirtllobfdgxuqbojk/sql`);
      }
    } catch (err) {
      console.log('❌ Network error:', err.message);
      console.log('\n⚠️  MANUAL ACTION REQUIRED: Copy the SQL above and run it in Supabase SQL Editor');
    }
  } else {
    console.log('\n✅ All structures exist');
  }

  console.log('\n=== FASE A Complete ===');
}

migrate().catch(console.error);
