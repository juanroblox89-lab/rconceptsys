/**
 * Supabase Configuration - Creative Production OS
 * Migrated from Firebase to Supabase (PostgreSQL + Auth + Storage)
 *
 * Setup:
 * 1. Create a project at https://supabase.com
 * 2. Copy your Project URL and anon public key from Settings > API
 * 3. Replace the values below (or use env vars for production)
 * 4. Run the SQL schema in supabase/schema.sql on your Supabase SQL editor
 * 5. Enable Google OAuth in Authentication > Providers
 * 6. Create a public storage bucket named "assets" (and "logos")
 */
import { createClient } from '@supabase/supabase-js';

// --- Configuration ---
// Replace these with your Supabase project credentials.
// For production, use environment variables injected by Vercel.
const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  'https://msqirtllobfdgxuqbojk.supabase.co';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  'YOUR-SUPABASE-ANON-PUBLIC-KEY';

// --- Client Initialization ---
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Required for Google OAuth PKCE flow to work
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// --- Master Admin Emails (auto-approved on first login) ---
export const MASTER_ADMIN_EMAILS = [
  'juanroblox89@gmail.com',
  'juanroblox89@rohlfing.com',
  'samuelrohlfing49@gmail.com',
  'jestalvz@gmail.com',
].map((e) => e.toLowerCase());

// --- Storage Bucket Names ---
export const BUCKETS = {
  ASSETS: 'assets',
  LOGOS: 'logos',
};

export default supabase;
