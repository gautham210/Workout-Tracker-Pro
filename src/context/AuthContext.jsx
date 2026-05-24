import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

// Cache the initial getSession call globally so StrictMode double-mounting
// awaits the exact same single promise, preventing lock contention and redundant calls.
let initialSessionPromise = null;
function getInitialSession() {
  if (!initialSessionPromise) {
    initialSessionPromise = supabase.auth.getSession();
  }
  return initialSessionPromise;
}

// How long (ms) a cached profile is considered fresh
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(null);

  // Refs to guard against races and stale closures
  const mountedRef          = useRef(true);
  const fetchingRef         = useRef(false);
  const lastUserIdRef       = useRef(null);
  const lastFetchedAtRef    = useRef(0);
  const lastProcessedTokenRef = useRef(null);

  // Set up mount lifetime tracking
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Core Profile Fetcher ──────────────────────────────────────────────────
  const fetchProfile = useCallback(async (sessionUser, { force = false } = {}) => {
    if (!mountedRef.current) return;

    if (!sessionUser) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      setNetworkError(null);
      lastUserIdRef.current = null;
      lastFetchedAtRef.current = 0;
      return;
    }

    const sameUser  = lastUserIdRef.current === sessionUser.id;
    const cacheWarm = Date.now() - lastFetchedAtRef.current < PROFILE_CACHE_TTL;
    if (sameUser && cacheWarm && !force) {
      if (mountedRef.current) {
        setUser(sessionUser);
        setLoading(false);
      }
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (mountedRef.current) {
        setUser(sessionUser);
        setLoading(false);
        setNetworkError('offline');
      }
      fetchingRef.current = false;
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .single();

      if (!mountedRef.current) return;

      // Profile does not exist yet -> construct placeholder recovery profile
      if (error?.code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id:                sessionUser.id,
            name:              sessionUser.email?.split('@')[0] ?? 'Athlete',
            include_rest_days: false,
            rest_days:         ['Sunday'],
          });

        if (!mountedRef.current) return;

        if (!insertError) {
          const { data: fresh } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sessionUser.id)
            .single();

          if (mountedRef.current) {
            setUser(sessionUser);
            setProfile(fresh ?? null);
            setLoading(false);
            setNetworkError(null);
            lastUserIdRef.current    = sessionUser.id;
            lastFetchedAtRef.current = Date.now();
          }
        } else {
          console.error('[AUTH] Profile auto-creation failed:', insertError.message);
          if (mountedRef.current) {
            setUser(sessionUser);
            setProfile(null);
            setLoading(false);
          }
        }
        return;
      }

      if (error) {
        console.error('[AUTH] Profile database error:', error.message);
        if (mountedRef.current) {
          setUser(sessionUser);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      if (mountedRef.current) {
        setUser(sessionUser);
        setProfile(data);
        setLoading(false);
        setNetworkError(null);
        lastUserIdRef.current    = sessionUser.id;
        lastFetchedAtRef.current = Date.now();
      }
    } catch (err) {
      console.error('[AUTH] Profile fetch threw:', err.message);
      if (mountedRef.current) {
        setUser(prev => prev ?? sessionUser);
        setLoading(false);
        setNetworkError(err.message?.includes('offline') ? 'offline' : 'network');
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // ── Unified Session Handler ───────────────────────────────────────────────
  const handleSession = useCallback((session, source) => {
    if (!mountedRef.current) return;

    const currentToken = session?.access_token ?? null;
    const currentUser = session?.user ?? null;

    // Check if the actual user identity is identical
    const isSameUser = lastUserIdRef.current === currentUser?.id;

    // ── STRICT DE-DUPLICATION ────────────────────────────────────────────────
    // If the token is identical, return immediately to ignore duplicate callbacks.
    if (lastProcessedTokenRef.current === currentToken && isSameUser) {
      return;
    }

    lastProcessedTokenRef.current = currentToken;

    // If the user identity is identical and we already loaded their profile,
    // only update the user object if metadata or email changed. Skip re-renders!
    if (isSameUser && user && profile) {
      if (user.email !== currentUser?.email || JSON.stringify(user.user_metadata) !== JSON.stringify(currentUser?.user_metadata)) {
        setUser(currentUser);
      }
      return;
    }

    // Process fresh user / signed out states
    if (!currentUser) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      setNetworkError(null);
      lastUserIdRef.current = null;
      lastFetchedAtRef.current = 0;
      return;
    }

    fetchProfile(currentUser);
  }, [user, profile, fetchProfile]);

  // ── StrictMode-Safe Unified Subscription lifecycle ────────────────────────
  useEffect(() => {
    let active = true;

    // 1. Resolve initial session check exactly once across mounts
    getInitialSession().then(({ data: { session }, error }) => {
      if (!active) return;
      if (error) {
        console.error('[AUTH] Initial getSession failed:', error.message);
        setLoading(false);
        return;
      }
      handleSession(session, 'initial_getSession');
    });

    // 2. Subscribe to standard auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      handleSession(session, `onAuthStateChange:${event}`);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [handleSession]);

  // ── Manual Profile synchronizer ──────────────────────────────────────────
  // Queries profiles table directly using existing user.id to sync data
  // without calling supabase.auth.getSession() or triggering GoTrue locks.
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    fetchingRef.current      = false;
    lastFetchedAtRef.current = 0;
    await fetchProfile(user, { force: true });
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, refreshProfile, loading, networkError }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
