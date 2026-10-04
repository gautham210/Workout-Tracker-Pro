import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { Session, User } from '@supabase/supabase-js';
import { clearLocalDb, getUnsyncedCount } from './db';
import { processOutbox, resetSyncState } from './sync';

export type SignOutResult = { ok: true } | { ok: false; unsynced: number };

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  /**
   * Signs out. If the user has unsynced workouts it first tries one forced sync; when rows remain it returns
   * `{ ok: false, unsynced }` so the UI can confirm, then call again with `{ discardUnsynced: true }`.
   */
  signOut: (options?: { discardUnsynced?: boolean }) => Promise<SignOutResult>;
};

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, isLoading: true,
  signOut: async () => ({ ok: true }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  const applySession = useCallback((next: Session | null) => {
    const nextId = next?.user?.id ?? null;
    if (nextId !== lastUserId.current) {
      // Different account (or signed out): drop every in-memory singleton belonging to the previous user.
      lastUserId.current = nextId;
      resetSyncState(nextId);
    }
    setSession(next);
    setUser(next?.user ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) applySession(session);
    }).catch((error) => {
      console.warn('[auth] session restoration failed', error);
      if (active) applySession(null);
    }).finally(() => { if (active) setIsLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(event === 'SIGNED_OUT' ? null : session);
      setIsLoading(false);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [applySession]);

  const signOut = useCallback<AuthContextType['signOut']>(async (options) => {
    const uid = lastUserId.current;
    if (uid) {
      if (!options?.discardUnsynced) {
        let unsynced = await getUnsyncedCount(uid);
        if (unsynced > 0) {
          await processOutbox(uid, true).catch(() => undefined);
          unsynced = await getUnsyncedCount(uid);
          if (unsynced > 0) return { ok: false, unsynced };
        }
      } else {
        await clearLocalDb(uid);
      }
    }
    resetSyncState(null);
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' }); // e.g. offline: still end the local session
    applySession(null);
    return { ok: true };
  }, [applySession]);

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
