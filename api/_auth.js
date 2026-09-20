import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://egefeiuyktelihsbbzyt.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_hd_-u_hgdVcXXjkCbRPkDA_xHf9XOfe';

// It is safe to use the anon key for verifying JWTs because we are just asking Supabase to decode and validate it.
const supabase = createClient(supabaseUrl, supabaseKey);

/** RLS-bound database client for the already verified bearer token. */
export function authenticatedDatabaseClient(req) {
  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: req.headers.authorization } },
  });
}

/**
 * Validates the Authorization header and returns the user object.
 * Returns { user: null, error: ... } if invalid.
 */
export async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or malformed Authorization header' };
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return { user: null, error: 'Token missing' };
  }

  // Hit the Supabase Auth API to securely verify the JWT
  const { data, error } = await supabase.auth.getUser(token);
  
  if (error || !data?.user) {
    console.error('[AUTH_HELPER] JWT Verification failed:', error?.message);
    return { user: null, error: 'Unauthorized: Invalid token' };
  }

  return { user: data.user, error: null };
}
