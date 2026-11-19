import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

/** Only use after checking `supabaseConfigured` (App shows a setup screen otherwise). */
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'uru-admin-auth' } })
  : (null as unknown as SupabaseClient);
