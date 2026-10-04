import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import ExerciseVisual from '../../components/ExerciseVisual';
import MetricHeader from '../../components/MetricHeader';
import MetricSkeleton from '../../components/MetricSkeleton';
import MetricSyncBadge from '../../components/MetricSyncBadge';
import StatusBanner from '../../components/StatusBanner';
import { useAuth } from '../../lib/AuthContext';
import { getLocalSession, LocalSession } from '../../lib/db';
import { exerciseVolume, formatDay, formatKg, sessionSetCounts, sessionTitle, sessionVolume } from '../../lib/analytics';
import { COLORS } from '../../lib/analyticsHooks';
import { useScreenInset } from '../../lib/layout';
import { useSyncState } from '../../lib/useSyncState';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const inset = useScreenInset();
  const syncState = useSyncState();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user || !id) return;
    try {
      const found = await getLocalSession(user.id, String(id));
      setSession(found); setState(found && found.is_finished ? 'ready' : 'missing');
    } catch (e) { setError(e instanceof Error ? e.message : 'The workout could not be read from this device.'); setState('error'); }
  }, [user, id]);
  useEffect(() => { load(); }, [load, syncState]);

  const counts = session ? sessionSetCounts(session) : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MetricHeader title="Workout" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: inset.contentBottom }]}>
        {state === 'loading' ? <MetricSkeleton rows={3} /> : null}
        {state === 'error' ? <StatusBanner kind="error" message={error} actionLabel="Retry" onAction={load} /> : null}
        {state === 'missing' ? <StatusBanner kind="info" message="This workout is not on this device. It may have been removed, or it belongs to another account." /> : null}
        {state === 'ready' && session && counts ? (
          <>
            <Text style={styles.date}>{formatDay(session.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            <Text accessibilityRole="header" style={styles.title}>{sessionTitle(session)}</Text>
            <View style={{ marginTop: 8 }}><MetricSyncBadge state={session.sync_state} /></View>
            <View style={styles.statRow}>
              <Stat value={formatKg(sessionVolume(session)).replace(' kg', '')} label="kg volume" />
              <Stat value={String(counts.working)} label="working sets" />
              <Stat value={session.duration_minutes ? String(session.duration_minutes) : '—'} label="minutes" />
            </View>
            <Text style={styles.note}>Volume counts completed, non-warm-up sets only{counts.warmup ? ` (${counts.warmup} warm-up set${counts.warmup === 1 ? '' : 's'} excluded)` : ''}.</Text>
            {session.notes ? <View style={styles.card}><Text style={styles.cardTitle}>Notes</Text><Text style={styles.body}>{session.notes}</Text></View> : null}
            {session.exercises.length === 0 ? <Text style={styles.note}>No exercises were recorded in this workout.</Text> : null}
            {session.exercises.map((ex) => (
              <View key={ex.id} style={styles.card}>
                <View style={styles.exHead}>
                  <ExerciseVisual name={ex.name} muscle={ex.muscle_group} size={52} radius={14} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{ex.name}</Text>
                    <Text style={styles.meta}>{ex.muscle_group ?? 'Muscle group unknown'} · {exerciseVolume(ex) ? formatKg(exerciseVolume(ex)) : 'no weighted volume'}</Text>
                  </View>
                </View>
                {ex.notes ? <Text style={[styles.body, { marginTop: 8 }]}>{ex.notes}</Text> : null}
                {ex.sets.length === 0 ? <Text style={styles.meta}>No sets recorded.</Text> : ex.sets.map((set, i) => (
                  <View key={set.id} style={[styles.setRow, !set.completed && { opacity: 0.6 }]} accessible
                    accessibilityLabel={`${set.is_warmup ? 'Warm-up set' : `Set ${i + 1}`}: ${set.weight_kg ?? 'no'} kilograms for ${set.reps ?? 'no'} reps${set.completed ? '' : ', not completed'}`}>
                    <Text style={[styles.setNo, set.is_warmup ? styles.warm : null]}>{set.is_warmup ? 'W' : String(set.set_number)}</Text>
                    <Text style={styles.setMain}>{set.weight_kg != null ? `${set.weight_kg} kg` : 'Bodyweight'} × {set.reps ?? '—'}</Text>
                    <Text style={styles.setMeta}>
                      {[set.is_warmup ? 'warm-up' : null, set.rir != null ? `${set.rir} RIR` : null, set.rpe != null ? `RPE ${set.rpe}` : null, set.completed ? null : 'not completed'].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  date: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line },
  statValue: { color: COLORS.ink, fontSize: 22, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 10, marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 14, marginTop: 12, borderWidth: 1, borderColor: COLORS.line },
  cardTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  exHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  meta: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  body: { color: COLORS.body, fontSize: 14, lineHeight: 20 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.line, marginTop: 8 },
  setNo: { width: 28, height: 28, borderRadius: 14, textAlign: 'center', lineHeight: 28, backgroundColor: '#eef2f8', color: COLORS.ink, fontWeight: '800', fontSize: 13, overflow: 'hidden' },
  warm: { backgroundColor: COLORS.amberSoft, color: COLORS.amber },
  setMain: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  setMeta: { color: COLORS.muted, fontSize: 12, flex: 1, textAlign: 'right' },
});
