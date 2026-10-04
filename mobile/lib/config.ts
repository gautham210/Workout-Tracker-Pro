import { Platform } from 'react-native';

// EXPO_PUBLIC_* must be referenced statically so Metro can inline them.
const rawSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const rawSupabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const rawBackendUrl = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').trim().replace(/\/+$/, '');

const DEV_PORT = '5173';
const devBackend = `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:${DEV_PORT}`;

export const SUPABASE_URL = rawSupabaseUrl;
export const SUPABASE_ANON_KEY = rawSupabaseAnonKey;
/** Env value, else a platform-aware localhost default in dev builds only. Empty string in production when unset. */
export const BACKEND_URL_VALUE = rawBackendUrl || (__DEV__ ? devBackend : '');

/** Returns a human readable message when required configuration is missing, otherwise null. */
export function getConfigError(): string | null {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!BACKEND_URL_VALUE) missing.push('EXPO_PUBLIC_BACKEND_URL');
  if (!missing.length) return null;
  return `This build is missing required configuration: ${missing.join(', ')}. Set them in your .env file (development) or with EAS environment variables (builds), then rebuild.`;
}
