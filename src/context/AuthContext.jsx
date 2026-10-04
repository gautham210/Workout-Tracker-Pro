/* eslint-disable react-refresh/only-export-components -- provider and hook intentionally live together */
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { clearUserLocalCaches } from '../lib/api';

const AuthContext = createContext({});

// How long (ms) a loaded profile is considered fresh
const PROFILE_CACHE_TTL = 5 * 60 * 1000;

const getCachedUser = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = localStorage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val);
          if (parsed && parsed.user) return parsed.user;
        }
      }
    }
  } catch { /* corrupt or unavailable storage */ }
  return null;
};

const getCachedProfile = (userId) => {
  if (!userId || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const val = localStorage.getItem(`wtp_profile_${userId}`);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

const sameUserData = (a, b) =>
  a?.id === b?.id && a?.email === b?.email && JSON.stringify(a?.user_metadata) === JSON.stringify(b?.user_metadata);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getCachedUser());
  const [profile, setProfile] = useState(() => {
    const cachedUser = getCachedUser();
    return cachedUser ? getCachedProfile(cachedUser.id) : null;
  });
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(null);

  // Refs hold everything handleSession/fetchProfile need so both stay referentially
  // stable and the auth subscription is created exactly once.
  const mountedRef = useRef(true);
  const userRef = useRef(user);
  const profileRef = useRef(profile);
  const loadedUserIdRef = useRef(null);      // user whose profile was last loaded
  const lastFetchedAtRef = useRef(0);
  const inflightRef = useRef(null);          // user id currently being fetched
  const generationRef = useRef(0);           // bumps on every sign-out / account switch

  const applySignedOut = useCallback(() => {
    const previousId = userRef.current?.id ?? loadedUserIdRef.current;
    generationRef.current += 1;
    inflightRef.current = null;
    loadedUserIdRef.current = null;
    lastFetchedAtRef.current = 0;
    userRef.current = null;
    profileRef.current = null;
    if (previousId) clearUserLocalCaches(previousId);
    setUser(null);
    setProfile(null);
    setNetworkError(null);
    setLoading(false);
  }, []);

  // ── Core Profile Fetcher ──────────────────────────────────────────────────
  const fetchProfile = useCallback(async (sessionUser, { force = false } = {}) => {
    if (!mountedRef.current || !sessionUser) return;
    const gen = generationRef.current;
    const stale = () => !mountedRef.current || gen !== generationRef.current;

    const sameUser = loadedUserIdRef.current === sessionUser.id;
    const cacheWarm = Date.now() - lastFetchedAtRef.current < PROFILE_CACHE_TTL;
    if (sameUser && cacheWarm && !force) {
      userRef.current = sessionUser;
      setUser(sessionUser);
      setLoading(false);
      return;
    }
    if (inflightRef.current === sessionUser.id) return;
    inflightRef.current = sessionUser.id;

    const finish = (nextProfile, { loaded = false } = {}) => {
      if (stale()) return;
      userRef.current = sessionUser;
      setUser(sessionUser);
      if (nextProfile !== undefined) { profileRef.current = nextProfile; setProfile(nextProfile); }
      setLoading(false);
      if (loaded) {
        setNetworkError(null);
        loadedUserIdRef.current = sessionUser.id;
        lastFetchedAtRef.current = Date.now();
      }
    };

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        finish();
        setNetworkError('offline');
        return;
      }

      const { data, error } = await supabase.from('profiles').select('*').eq('id', sessionUser.id).single();
      if (stale()) return;

      if (error?.code === 'PGRST116') {
        // No profile row yet: create one. Never persist a placeholder display name.
        const meta = sessionUser.user_metadata || {};
        const name = String(meta.name || meta.full_name || sessionUser.email?.split('@')[0] || '').trim();
        const { error: insertError } = await supabase.from('profiles').insert({
          id: sessionUser.id,
          name,
          include_rest_days: false,
          rest_days: ['Sunday'],
        });
        if (stale()) return;
        if (insertError) {
          console.error('[AUTH] Profile auto-creation failed:', insertError.message);
          finish(null);
          return;
        }
        const { data: fresh } = await supabase.from('profiles').select('*').eq('id', sessionUser.id).single();
        finish(fresh ?? null, { loaded: true });
        return;
      }

      if (error) {
        console.error('[AUTH] Profile database error:', error.message);
        finish(profileRef.current ?? null);
        return;
      }

      finish(data, { loaded: true });
      try { localStorage.setItem(`wtp_profile_${sessionUser.id}`, JSON.stringify(data)); } catch { /* quota */ }
    } catch (err) {
      console.error('[AUTH] Profile fetch threw:', err.message);
      if (!stale()) {
        userRef.current = userRef.current ?? sessionUser;
        setUser((prev) => prev ?? sessionUser);
        setLoading(false);
        setNetworkError(err.message?.includes('offline') ? 'offline' : 'network');
      }
    } finally {
      if (inflightRef.current === sessionUser.id) inflightRef.current = null;
    }
  }, []);

  // ── Unified Session Handler (stable) ──────────────────────────────────────
  const handleSession = useCallback((session) => {
    if (!mountedRef.current) return;
    const nextUser = session?.user ?? null;

    if (!nextUser) {
      // A missing session means signed out; never resurrect the previous user.
      applySignedOut();
      return;
    }

    const currentUser = userRef.current;
    if (currentUser?.id === nextUser.id && loadedUserIdRef.current === nextUser.id) {
      // Token refresh / duplicate event: no refetch, only sync changed metadata.
      if (!sameUserData(currentUser, nextUser)) { userRef.current = nextUser; setUser(nextUser); }
      return;
    }

    // Switching accounts: drop the previous account's state first.
    if (currentUser && currentUser.id !== nextUser.id) applySignedOut();
    fetchProfile(nextUser);
  }, [applySignedOut, fetchProfile]);

  // ── Subscription lifecycle: created exactly once ──────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    let eventSeen = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      eventSeen = true;
      handleSession(session);
    });

    const fallBackToCache = (message, isNetwork) => {
      console.error('[AUTH] Initial getSession failed:', message);
      if (isNetwork) setNetworkError('network');
      const cachedUser = isNetwork ? getCachedUser() : null;
      if (cachedUser) {
        userRef.current = cachedUser;
        setUser(cachedUser);
        setProfile(getCachedProfile(cachedUser.id));
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // A newer auth event (e.g. SIGNED_OUT) already settled the state.
      if (!active || eventSeen) return;
      if (error) {
        fallBackToCache(error.message, /fetch|network|offline/i.test(error.message || ''));
        return;
      }
      handleSession(session);
    }).catch((err) => {
      if (active && !eventSeen) fallBackToCache(err.message, true);
    });

    return () => {
      active = false;
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [handleSession]);

  const refreshProfile = useCallback(async () => {
    const current = userRef.current;
    if (!current) return;
    inflightRef.current = null;
    lastFetchedAtRef.current = 0;
    await fetchProfile(current, { force: true });
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, refreshProfile, loading, networkError }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
