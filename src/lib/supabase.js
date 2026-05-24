import { createClient } from '@supabase/supabase-js';

// ── Resolve credentials ───────────────────────────────────────────────────────
// Priority: VITE_ env vars → hardcoded fallback (public anon key, safe by design)
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || 'https://egefeiuyktelihsbbzyt.supabase.co';
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_hd_-u_hgdVcXXjkCbRPkDA_xHf9XOfe';

// ── Validate URL format before creating the client ────────────────────────────
if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
  console.error(
    '[Supabase] Invalid URL detected:', supabaseUrl,
    '\nMake sure VITE_SUPABASE_URL is set correctly in your environment.'
  );
}

// ── Create client with hardened options ───────────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    // Storage defaults to localStorage — sessions survive tab/app switches
  },
});

// ── Export URL for diagnostics ────────────────────────────────────────────────
export const SUPABASE_URL = supabaseUrl;
