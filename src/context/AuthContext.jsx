import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

// Events that mean "the user has genuinely changed" — require a profile re-fetch
const USER_CHANGE_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'PASSWORD_RECOVERY']);

// Events that are safe to skip profile re-fetch (token silently refreshed, same user)
const SILENT_EVENTS = new Set(['TOKEN_REFRESHED', 'INITIAL_SESSION']);

// How long (ms) a cached profile is considered fresh — skip re-fetch within this window
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(null);

  // ── Refs to guard against races and stale closures ────────────────────────
  const mountedRef          = useRef(true);  // unmount guard
  const fetchingRef         = useRef(false); // deduplicate in-flight fetch
  const lastUserIdRef       = useRef(null);  // skip fetch if same user
  const lastFetchedAtRef    = useRef(0);     // timestamp of last successful fetch
  const initDoneRef         = useRef(false); // getSession already called

  // Called once on unmount to stop all state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Core profile fetcher ──────────────────────────────────────────────────
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

    // Skip re-fetch if it's the same user AND cache is still warm AND not forced
    const sameUser   = lastUserIdRef.current === sessionUser.id;
    const cacheWarm  = Date.now() - lastFetchedAtRef.current < PROFILE_CACHE_TTL;
    if (sameUser && cacheWarm && !force) {
      // Just make sure user/loading state is correct without re-fetching
      if (mountedRef.current) {
        setUser(sessionUser);
        setLoading(false);
      }
      return;
    }

    // Deduplicate concurrent calls
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    // Offline guard — don't retry when we know we're offline
    if (!navigator.onLine) {
      console.warn('[AuthContext] Device is offline — skipping profile fetch');
      if (mountedRef.current) {
        setUser(sessionUser);
        // Keep existing profile if we have one from cache
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

      if (!mountedRef.current) { fetchingRef.current = false; return; }

      // PGRST116 = row not found — insert recovery profile
      if (error?.code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id:                sessionUser.id,
            name:              sessionUser.email?.split('@')[0] ?? 'Athlete',
            include_rest_days: false,
            rest_days:         ['Sunday'],
          });

        if (!mountedRef.current) { fetchingRef.current = false; return; }

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
          console.error('[AuthContext] Profile insert failed:', insertError.message);
          if (mountedRef.current) {
            setUser(sessionUser);
            setProfile(null);
            setLoading(false);
          }
        }
        fetchingRef.current = false;
        return;
      }

      // Network / DNS error
      if (error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('Failed')) {
        console.error('[AuthContext] Network error fetching profile:', error.message);
        if (mountedRef.current) {
          setUser(sessionUser);
          setLoading(false);
          setNetworkError('network');
        }
        fetchingRef.current = false;
        return;
      }

      if (error) {
        console.error('[AuthContext] Profile error:', error.code, error.message);
        if (mountedRef.current) {
          setUser(sessionUser);
          setProfile(null);
          setLoading(false);
        }
        fetchingRef.current = false;
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
      // Catches ERR_NAME_NOT_RESOLVED, fetch aborted, etc.
      console.error('[AuthContext] Fetch threw:', err.message);
      if (mountedRef.current) {
        setUser(prev => prev ?? sessionUser);
        setLoading(false);
        setNetworkError(err.message?.includes('offline') ? 'offline' : 'network');
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // ── Initial session + auth state listener ─────────────────────────────────
  useEffect(() => {
    if (initDoneRef.current) return; // StrictMode double-invoke guard
    initDoneRef.current = true;

    // 1. Get current session once
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[AuthContext] getSession error:', error.message);
        if (mountedRef.current) setLoading(false);
        return;
      }
      fetchProfile(session?.user ?? null);
    });

    // 2. Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      // For silent events (token refresh), only update user state if we don't
      // already have one — never re-fetch profile or flicker loading
      if (SILENT_EVENTS.has(event)) {
        if (session?.user && !lastUserIdRef.current) {
          // First-time init via INITIAL_SESSION
          fetchProfile(session.user);
        }
        // Token refresh while logged in — do nothing (Supabase handles token storage)
        return;
      }

      // SIGNED_OUT — clear everything
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        setNetworkError(null);
        lastUserIdRef.current    = null;
        lastFetchedAtRef.current = 0;
        fetchingRef.current      = false;
        return;
      }

      // SIGNED_IN / USER_UPDATED — always re-fetch
      if (USER_CHANGE_EVENTS.has(event)) {
        fetchingRef.current      = false; // allow fresh fetch
        lastFetchedAtRef.current = 0;     // bust cache
        fetchProfile(session.user, { force: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // ── Online recovery ────────────────────────────────────────────────────────
  // When the device comes back online, retry the profile fetch if it failed
  useEffect(() => {
    const handleOnline = () => {
      if (networkError && user) {
        console.log('[AuthContext] Back online — retrying profile fetch');
        setNetworkError(null);
        fetchingRef.current      = false;
        lastFetchedAtRef.current = 0;
        fetchProfile(user, { force: true });
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [networkError, user, fetchProfile]);

  // ── Called after mutations to sync profile ────────────────────────────────
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    fetchingRef.current      = false;
    lastFetchedAtRef.current = 0;
    await fetchProfile(session.user, { force: true });
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, refreshProfile, loading, networkError }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
