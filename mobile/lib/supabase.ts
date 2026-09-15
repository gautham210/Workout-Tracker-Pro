import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const memoryDb: { [key: string]: string } = {};
let useMemoryOnly = false;

// Test if AsyncStorage actually works
try {
  AsyncStorage.getItem('__test_wtp_storage__').then(() => {}).catch(() => {
    useMemoryOnly = true;
  });
} catch {
  useMemoryOnly = true;
}

// Robust in-memory storage fallback to prevent emulator environment crashes when AsyncStorage native module is null
export const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (useMemoryOnly) return memoryDb[key] || null;
    try {
      const res = await AsyncStorage.getItem(key);
      return res;
    } catch {
      useMemoryOnly = true;
      return memoryDb[key] || null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (useMemoryOnly) {
      memoryDb[key] = value;
      return;
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      useMemoryOnly = true;
      memoryDb[key] = value;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (useMemoryOnly) {
      delete memoryDb[key];
      return;
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      useMemoryOnly = true;
      delete memoryDb[key];
    }
  },
  multiSet: async (pairs: [string, string][]): Promise<void> => {
    if (useMemoryOnly) {
      pairs.forEach(([key, val]) => {
        memoryDb[key] = val;
      });
      return;
    }
    try {
      await (AsyncStorage as any).multiSet(pairs);
    } catch {
      useMemoryOnly = true;
      pairs.forEach(([key, val]) => {
        memoryDb[key] = val;
      });
    }
  },
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    if (useMemoryOnly) {
      return keys.map(k => [k, memoryDb[k] || null]);
    }
    try {
      return await (AsyncStorage as any).multiGet(keys);
    } catch {
      useMemoryOnly = true;
      return keys.map(k => [k, memoryDb[k] || null]);
    }
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    if (useMemoryOnly) {
      keys.forEach(k => delete memoryDb[k]);
      return;
    }
    try {
      await (AsyncStorage as any).multiRemove(keys);
    } catch {
      useMemoryOnly = true;
      keys.forEach(k => delete memoryDb[k]);
    }
  }
};

const supabaseUrl = 'https://egefeiuyktelihsbbzyt.supabase.co';
const supabaseAnonKey = 'sb_publishable_hd_-u_hgdVcXXjkCbRPkDA_xHf9XOfe';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
