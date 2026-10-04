import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Stack as ExpoStack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/AuthContext';
import { View, ActivityIndicator, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { initDb } from '../lib/db';
import { startSyncEngine } from '../lib/sync';
import { configError } from '../lib/supabase';

type DbContextType = { dbReady: boolean };
const DbContext = createContext<DbContextType>({ dbReady: false });
/** True once local migrations have completed. Children of DbProvider only render when it is true. */
export const useDbReady = () => useContext(DbContext).dbReady;

function Splash() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#007aff" />
    </View>
  );
}

function ErrorScreen({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function DbProvider({ children }: { children: React.ReactNode }) {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    initDb().then(() => { if (active) setDbReady(true); }).catch((err) => {
      console.error('[db] init failed', err);
      if (active) setError(err instanceof Error ? err.message : 'The local database could not be opened.');
    });
    return () => { active = false; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) return <ErrorScreen title="Could not open local data" message={error} onRetry={retry} />;
  if (!dbReady) return <Splash />;
  return <DbContext.Provider value={{ dbReady }}>{children}</DbContext.Provider>;
}

function RootLayoutNav() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)/');
    }
  }, [user, isLoading, segments]);

  // Only mounted after the database is ready (see DbProvider), so the outbox always exists.
  useEffect(() => {
    if (!user) return;
    return startSyncEngine(user.id);
  }, [user?.id]);

  if (isLoading) return <Splash />;

  return (
    <ExpoStack screenOptions={{ headerShown: false }}>
      <ExpoStack.Screen name="(tabs)" options={{ headerShown: false }} />
      <ExpoStack.Screen name="(auth)" options={{ headerShown: false }} />
    </ExpoStack>
  );
}

export default function RootLayout() {
  if (configError) return <ErrorScreen title="App configuration error" message={configError} />;
  return (
    <DbProvider>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </DbProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#f7f8fc', justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#172033', marginBottom: 8, textAlign: 'center' },
  errorMessage: { fontSize: 14, color: '#68758a', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  retry: { backgroundColor: '#007aff', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
