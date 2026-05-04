import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Prevent duplicate in-flight fetches when auth state fires multiple times
  const fetchingRef = useRef(false);

  const fetchProfile = async (sessionUser) => {
    if (!sessionUser) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    // Deduplicate concurrent calls
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sessionUser.id)
      .single();

    console.log('[PROFILE FETCH]', { userId: sessionUser.id, data, errorCode: error?.code, errorMsg: error?.message });

    fetchingRef.current = false;

    // PGRST116 = row not found (not a permissions error)
    // Happens for users created before the trigger was deployed
    if (error?.code === 'PGRST116') {
      console.log('[PROFILE] Row missing — inserting recovery profile');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id:                sessionUser.id,
          name:              sessionUser.email?.split('@')[0] ?? 'Athlete',
          include_rest_days: false,
          rest_days:         ['Sunday'],
        });

      console.log('[PROFILE INSERT]', { insertError: insertError?.message });

      if (!insertError) {
        // Re-fetch the just-created row
        const { data: fresh, error: freshErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .single();

        console.log('[PROFILE REFETCH]', { fresh, freshErr: freshErr?.message });
        setUser(sessionUser);
        setProfile(fresh ?? null);
        setLoading(false);
        return;
      }
    }

    if (error) {
      // Genuine permission error — surface it, don't silently null out
      console.error('[PROFILE ERROR]', error.code, error.message);
      setUser(sessionUser);
      setProfile(null);
      setLoading(false);
      return;
    }

    setUser(sessionUser);
    setProfile(data);
    setLoading(false);
  };

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AUTH INIT]', session?.user?.id ?? 'no session');
      fetchProfile(session?.user ?? null);
    });

    // React to login / logout / token refresh
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[AUTH STATE]', _event, session?.user?.id ?? 'signed out');
      // Only reset loading if actually changing user
      setLoading(true);
      fetchingRef.current = false; // allow fresh fetch on state change
      fetchProfile(session?.user ?? null);
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  // Called after any mutation to keep global profile in sync
  const refreshProfile = async () => {
    // Get a fresh session rather than relying on stale closure
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    fetchingRef.current = false; // allow re-fetch
    await fetchProfile(session.user);
  };

  return (
    <AuthContext.Provider value={{ user, profile, refreshProfile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
