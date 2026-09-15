import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://egefeiuyktelihsbbzyt.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_hd_-u_hgdVcXXjkCbRPkDA_xHf9XOfe';

if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
  console.error(
    '[NETWORK] Invalid URL detected:', supabaseUrl,
    '\nMake sure VITE_SUPABASE_URL is set correctly in your environment.'
  );
}

// ── Cooldown & Network Resilience state ────────────────────────────────────────
let consecutiveFailures = 0;
let cooldownUntil = 0;
const MAX_RETRIES = 2;
const BASE_DELAY = 1000; // 1 second base delay
const MAX_COOLDOWN = 30000; // 30 seconds max cooldown

/**
 * Resets the network cooldown to immediately allow outgoing requests
 */
export function resetNetworkCooldown() {
  consecutiveFailures = 0;
  cooldownUntil = 0;
  console.log('[NETWORK] Cooldown cleared manually.');
}

/**
 * Custom fetch wrapper for Supabase client.
 * Implements offline guards, exponential backoff, and failure cooldowns
 * to prevent token refresh storms during intermittent connectivity or phone sleep.
 */
async function customResilientFetch(url, options) {
  // 1. Check offline state
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new TypeError('Failed to fetch (device offline)');
  }

  // 2. Check active cooldown
  const now = Date.now();
  if (now < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - now) / 1000);
    throw new TypeError(`Failed to fetch (network cooldown active for another ${remaining}s)`);
  }

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      const response = await fetch(url, options);

      // Successfully resolved request
      if (response.ok) {
        consecutiveFailures = 0;
        cooldownUntil = 0;
      }
      return response;
    } catch (error) {
      attempt++;

      const isNetworkOrDnsError = 
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ERR_NAME_NOT_RESOLVED') ||
        error.name === 'TypeError';

      if (isNetworkOrDnsError) {
        consecutiveFailures++;
        // Calculate exponential backoff cooldown window
        const delay = Math.min(BASE_DELAY * Math.pow(2, consecutiveFailures), MAX_COOLDOWN);
        cooldownUntil = Date.now() + delay;
        console.error(`[NETWORK] Connection failure on attempt ${attempt}. Cooldown activated for ${delay}ms. Error: ${error.message}`);
        throw error;
      }

      if (attempt > MAX_RETRIES) {
        throw error;
      }

      // Retry with slight delay
      const backoffDelay = BASE_DELAY * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }
}

// ── Create client with hardened options ───────────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Per specification
  },
  global: {
    fetch: customResilientFetch,
  },
});

export const SUPABASE_URL = supabaseUrl;
