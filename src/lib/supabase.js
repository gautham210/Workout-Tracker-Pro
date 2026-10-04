import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (value) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

/** Lists missing/invalid configuration so the UI can show a clear setup screen. */
export const supabaseConfigErrors = [
  !supabaseUrl && 'VITE_SUPABASE_URL is not set.',
  supabaseUrl && !isValidUrl(supabaseUrl) && 'VITE_SUPABASE_URL must be a valid https:// URL.',
  !supabaseKey && 'VITE_SUPABASE_ANON_KEY is not set.',
].filter(Boolean);

export const isSupabaseConfigured = supabaseConfigErrors.length === 0;

const MAX_RETRIES = 2;
const BACKOFF_MS = [300, 800];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Kept for API compatibility; there is no global cooldown any more. */
export function resetNetworkCooldown() {}

/**
 * Fetch wrapper for the Supabase client. Retries only idempotent GET requests on
 * network errors or 5xx responses with a short backoff. Never retries aborts and
 * never throttles auth/token refresh calls.
 */
async function customResilientFetch(input, init) {
  const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
  const canRetry = method === 'GET';
  let attempt = 0;
  for (;;) {
    try {
      const response = await fetch(input, init);
      if (canRetry && response.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt]);
        attempt++;
        continue;
      }
      return response;
    } catch (error) {
      if (error?.name === 'AbortError' || !canRetry || attempt >= MAX_RETRIES || init?.signal?.aborted) throw error;
      await sleep(BACKOFF_MS[attempt]);
      attempt++;
    }
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      global: { fetch: customResilientFetch },
    })
  : null;

export const SUPABASE_URL = supabaseUrl;
