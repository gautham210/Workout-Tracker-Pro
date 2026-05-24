import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase, resetNetworkCooldown } from '../lib/supabase';

const AuthContext = createContext({});

// Events that mean "the user has genuinely changed" — require a profile check
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
  const lastProcessedTokenRef = useRef(null); // memoize last processed access token

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
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.warn('[AUTH] Device is offline — skipping profile fetch');
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
          console.error('[AUTH] Profile insert failed:', insertError.message);
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
        console.error('[AUTH] Network error fetching profile:', error.message);
        if (mountedRef.current) {
          setUser(sessionUser);
          setLoading(false);
          setNetworkError('network');
        }
        fetchingRef.current = false;
        return;
      }

      if (error) {
        console.error('[AUTH] Profile error:', error.code, error.message);
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
      console.error('[AUTH] Fetch threw:', err.message);
      if (mountedRef.current) {
        setUser(prev => prev ?? sessionUser);
        setLoading(false);
        setNetworkError(err.message?.includes('offline') ? 'offline' : 'network');
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // ── StrictMode-Safe Auth State Listener ──────────────────────────────────
  useEffect(() => {
    let active = true;

    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!active) return;
      if (error) {
        console.error('[AUTH] getSession error:', error.message);
        setLoading(false);
        return;
      }

      if (session?.user) {
        lastProcessedTokenRef.current = session.access_token;
        fetchProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // 2. Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !mountedRef.current) return;

      const currentToken = session?.access_token ?? null;
      const currentUser = session?.user ?? null;

      // ── Deduplicate auth listener triggers ────────────────────────────────
      // If the session token and user ID are identical to the last processed ones,
      // skip completely to prevent token refresh storms and redundant fetches.
      if (lastProcessedTokenRef.current === currentToken && lastUserIdRef.current === currentUser?.id) {
        return;
      }

      console.log(`[AUTH] State Change -> Event: ${event}, User: ${currentUser?.id ?? 'none'}`);
      lastProcessedTokenRef.current = currentToken;

      // SIGNED_OUT — clear auth context silently
      if (event === 'SIGNED_OUT' || !currentUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        setNetworkError(null);
        lastUserIdRef.current    = null;
        lastFetchedAtRef.current = 0;
        fetchingRef.current      = false;
        return;
      }

      // Silent token refresh
      if (SILENT_EVENTS.has(event)) {
        if (!lastUserIdRef.current || lastUserIdRef.current !== currentUser.id) {
          fetchProfile(currentUser);
        } else {
          setUser(currentUser); // Update user info without profile re-fetch or loading state flicker
        }
        return;
      }

      // SIGNED_IN / USER_UPDATED
      if (USER_CHANGE_EVENTS.has(event)) {
        // Only force profile re-fetch if the user actually changed or we do not have a profile yet
        const forceFetch = lastUserIdRef.current !== currentUser.id || !profile;
        fetchProfile(currentUser, { force: forceFetch });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, profile]);

  // ── Network recovery and Tab Focus triggers ───────────────────────────────
  // Automatically clear custom fetch cooldowns when restoring network or returning to page
  useEffect(() => {
    const handleReconnectOrFocus = () => {
      console.log('[AUTH] App focused/reconnected. Cleaning cooldowns.');
      resetNetworkCooldown();

      if (networkError && user) {
        setNetworkError(null);
        fetchingRef.current      = false;
        lastFetchedAtRef.current = 0;
        fetchProfile(user, { force: true });
      }
    };

    window.addEventListener('online', handleReconnectOrFocus);
    window.addEventListener('focus', handleReconnectOrFocus);

    return () => {
      window.removeEventListener('online', handleReconnectOrFocus);
      window.removeEventListener('focus', handleReconnectOrFocus);
    };
  }, [networkError, user, fetchProfile]);

  // ── Manual Profile synchronizer ──────────────────────────────────────────
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
