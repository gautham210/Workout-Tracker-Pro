import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listLocalFinishedSessions, LocalSession } from './db';
import { useSyncState } from './useSyncState';

/** Shared palette. Text colours are chosen for >= 4.5:1 contrast on white / #f7f8fc. */
export const COLORS = {
  bg: '#f7f8fc', card: '#ffffff', ink: '#172033', body: '#34425a', muted: '#566379', faint: '#6b778b',
  line: 'rgba(28,48,82,0.10)', blue: '#007aff', blueText: '#0b5fc4', green: '#0f7a55', greenSoft: '#e5f6ee',
  amber: '#8a5a00', amberSoft: '#fff4de', red: '#b3261e', redSoft: '#fdecea', blueSoft: '#eaf4ff',
};

/**
 * Loads finished sessions from local SQLite (works offline). Reloads whenever the screen gains focus and
 * whenever the sync state changes, so per-session sync badges and new workouts never go stale.
 */
export function useLocalSessions(userId: string | undefined, limit = 200) {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const syncState = useSyncState();
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (!userId) { setSessions([]); setLoading(false); return; }
    try {
      const rows = await listLocalFinishedSessions(userId, limit, 0);
      if (id !== requestId.current) return;
      setSessions(rows); setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : 'Local workout data could not be read.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [userId, limit]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => { reload(); }, [syncState, reload]);
  return { sessions, loading, error, reload };
}
