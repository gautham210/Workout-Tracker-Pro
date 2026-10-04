import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY, getConfigError } from './config';

const memoryDb: { [key: string]: string } = {};
let useMemoryOnly = false;

// Robust in-memory fallback for environments where the AsyncStorage native module is unavailable.
async function withFallback<T>(run: () => Promise<T>, fallback: () => T): Promise<T> {
  if (useMemoryOnly) return fallback();
  try {
    return await run();
  } catch {
    useMemoryOnly = true;
    return fallback();
  }
}

export const safeStorage = {
  getItem: (key: string): Promise<string | null> =>
    withFallback(() => AsyncStorage.getItem(key), () => memoryDb[key] ?? null),
  setItem: (key: string, value: string): Promise<void> =>
    withFallback(() => AsyncStorage.setItem(key, value), () => { memoryDb[key] = value; }),
  removeItem: (key: string): Promise<void> =>
    withFallback(() => AsyncStorage.removeItem(key), () => { delete memoryDb[key]; }),
  multiSet: (pairs: [string, string][]): Promise<void> =>
    withFallback(() => (AsyncStorage as any).multiSet(pairs), () => { pairs.forEach(([k, v]) => { memoryDb[k] = v; }); }),
  multiGet: (keys: string[]): Promise<[string, string | null][]> =>
    withFallback(() => (AsyncStorage as any).multiGet(keys), () => keys.map((k) => [k, memoryDb[k] ?? null] as [string, string | null])),
  multiRemove: (keys: string[]): Promise<void> =>
    withFallback(() => (AsyncStorage as any).multiRemove(keys), () => { keys.forEach((k) => delete memoryDb[k]); }),
};

// Secure session storage. SecureStore values are limited (~2048 bytes), so the session JSON is chunked.
const CHUNK_SIZE = 1800;
// Non-persistent fallback used only if the native keystore itself fails; never written to plaintext disk.
const volatileSession: Record<string, string> = {};

const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.chunk${i}`;

async function secureDeleteAll(key: string) {
  const count = Number(await SecureStore.getItemAsync(countKey(key)).catch(() => null));
  if (Number.isFinite(count) && count > 0) {
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => undefined);
  }
  await SecureStore.deleteItemAsync(countKey(key)).catch(() => undefined);
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

async function secureSet(key: string, value: string) {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) parts.push(value.slice(i, i + CHUNK_SIZE));
  await secureDeleteAll(key);
  for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(chunkKey(key, i), parts[i]);
  await SecureStore.setItemAsync(countKey(key), String(parts.length));
}

async function secureGet(key: string): Promise<string | null> {
  const countRaw = await SecureStore.getItemAsync(countKey(key));
  if (countRaw) {
    const count = Number(countRaw);
    let out = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part == null) return null;
      out += part;
    }
    return out;
  }
  return SecureStore.getItemAsync(key); // legacy unchunked value
}

const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') return safeStorage.getItem(key);
    try {
      const val = await secureGet(key);
      if (val) {
        // Remove any plaintext copy left over from older builds.
        await safeStorage.removeItem(key).catch(() => undefined);
        return val;
      }
      const legacy = await safeStorage.getItem(key);
      if (legacy) {
        await secureSet(key, legacy);
        await safeStorage.removeItem(key);
        return legacy;
      }
      return volatileSession[key] ?? null;
    } catch (error) {
      console.warn('[auth] secure storage read failed', error);
      return volatileSession[key] ?? null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') return safeStorage.setItem(key, value);
    try {
      await secureSet(key, value);
      delete volatileSession[key];
    } catch (error) {
      console.warn('[auth] secure storage write failed; session kept in memory only', error);
      volatileSession[key] = value;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    delete volatileSession[key];
    if (Platform.OS === 'web') return safeStorage.removeItem(key);
    try { await secureDeleteAll(key); } catch (error) { console.warn('[auth] secure storage delete failed', error); }
    await safeStorage.removeItem(key).catch(() => undefined);
  },
};

/** Non-null when env configuration is missing; the root layout renders this instead of the app. */
export const configError = getConfigError();

// createClient throws on empty values, so use inert placeholders when misconfigured (the app never renders in that case).
export const supabase = createClient(SUPABASE_URL || 'https://config-missing.invalid', SUPABASE_ANON_KEY || 'config-missing', {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
