import { createClient } from '@supabase/supabase-js';

const MAX_AUTH_HEADER = 4096;

export class AuthConfigError extends Error {
  constructor() { super('Server auth is not configured'); this.name = 'AuthConfigError'; }
}

function authConfig() {
  const env = process.env;
  const url = env.VITE_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new AuthConfigError();
  return { url, key };
}

let verifierClient = null;
function verifier() {
  // The anon key is only used to ask Supabase Auth to verify the presented JWT.
  if (!verifierClient) { const { url, key } = authConfig(); verifierClient = createClient(url, key); }
  return verifierClient;
}

/** RLS-bound database client for the bearer token. Throws AuthConfigError if env is missing. */
export function authenticatedDatabaseClient(req) {
  const { url, key } = authConfig();
  return createClient(url, key, { global: { headers: { Authorization: req.headers.authorization } } });
}

/** Extracts a bearer token without touching the network. Returns { token } or { error }. */
export function readBearerToken(req) {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string' || header.length > MAX_AUTH_HEADER || !/^Bearer [^\s]+$/.test(header)) {
    return { error: 'Missing or malformed Authorization header' };
  }
  return { token: header.slice(7) };
}

/**
 * Validates the Authorization header and returns { user, error, status }.
 * `client` (optional) is an injectable Supabase-like client for tests.
 */
export async function authenticate(req, { client } = {}) {
  const { token, error: headerError } = readBearerToken(req);
  if (headerError) return { user: null, error: headerError, status: 401 };
  let auth;
  try { auth = (client || verifier()).auth; } catch (error) {
    if (error instanceof AuthConfigError) return { user: null, error: error.message, status: 500 };
    throw error;
  }
  let result;
  try { result = await auth.getUser(token); } catch { return { user: null, error: 'Unauthorized: Invalid token', status: 401 }; }
  if (result?.error || !result?.data?.user) return { user: null, error: 'Unauthorized: Invalid token', status: 401 };
  return { user: result.data.user, error: null, status: 200 };
}
