import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ExerciseVisual from '../components/ExerciseVisual';
import MetricHeader from '../components/MetricHeader';
import MetricSkeleton from '../components/MetricSkeleton';
import StatusBanner from '../components/StatusBanner';
import { useAuth } from '../lib/AuthContext';
import { computeHomeStats, countFinishedSessions, formatDay, isWorkingSet, summarizeExercises } from '../lib/analytics';
import { COLORS, useLocalSessions } from '../lib/analyticsHooks';
import { useScreenInset } from '../lib/layout';

export default function AthleteSpaceScreen() {
  const { user } = useAuth();
  const inset = useScreenInset();
  const { sessions, loading, error, reload } = useLocalSessions(user?.id, 200);
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => { if (user) countFinishedSessions(user.id).then(setTotal).catch(() => setTotal(null)); }, [user, sessions.length]);

  const stats = useMemo(() => computeHomeStats(sessions), [sessions]);
  const lifts = useMemo(() => summarizeExercises(sessions).slice(0, 5), [sessions]);
  const muscles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) for (const ex of s.exercises) {
      const sets = ex.sets.filter(isWorkingSet).length;
      if (sets && ex.muscle_group) counts.set(ex.muscle_group, (counts.get(ex.muscle_group) ?? 0) + sets);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sessions]);
  const first = sessions.length ? sessions[sessions.length - 1] : null;
  const maxSets = muscles[0]?.[1] ?? 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MetricHeader title="Athlete space" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: inset.contentBottom }]}>
        <StatusBanner kind="info" title="Private for now" message="This is a summary of your own training, computed from workouts stored on this device. Friends, sharing and leaderboards are not available yet, and nothing here is visible to anyone else." style={{ marginBottom: 14 }} />
        {error ? <StatusBanner kind="error" message={error} actionLabel="Retry" onAction={reload} style={{ marginBottom: 14 }} /> : null}
        {loading ? <MetricSkeleton rows={3} /> : (
          <>
            <View style={styles.statRow}>
              <Stat value={total === null ? String(sessions.length) : String(total)} label="workouts logged" />
              <Stat value={String(stats.thisWeekCount)} label="this week" />
              <Stat value={String(stats.weekStreak)} label="week streak" />
            </View>
            {first ? <Text style={styles.note}>Earliest workout in the latest {sessions.length}: {formatDay(first.date, { month: 'short', day: 'numeric', year: 'numeric' })}.</Text> : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Top estimated lifts</Text>
              {lifts.length === 0 ? <Text style={styles.muted}>Complete sets with weight and reps to see estimated 1RMs.</Text> : lifts.map((l) => (
                <View key={l.exerciseId} style={styles.liftRow}>
                  <ExerciseVisual name={l.name} muscle={l.muscle} size={44} radius={12} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liftName} numberOfLines={1}>{l.name}</Text>
                    <Text style={styles.muted}>{Math.round(l.bestE1rm)} kg estimated 1RM · {l.sessions} session{l.sessions === 1 ? '' : 's'}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Where your sets go</Text>
              <Text style={styles.muted}>Completed working sets by muscle group across your latest {sessions.length} workouts.</Text>
              {muscles.length === 0 ? <Text style={[styles.muted, { marginTop: 8 }]}>No data yet.</Text> : muscles.map(([muscle, sets]) => (
                <View key={muscle} style={{ marginTop: 10 }} accessible accessibilityLabel={`${muscle}: ${sets} sets`}>
                  <View style={styles.rowBetween}><Text style={styles.liftName}>{muscle}</Text><Text style={styles.muted}>{sets} sets</Text></View>
                  <View style={styles.track}><View style={[styles.fill, { width: `${Math.round((sets / maxSets) * 100)}%` }]} /></View>
                </View>
              ))}
            </View>
          </>
        )}
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
  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line },
  statValue: { color: COLORS.ink, fontSize: 22, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  note: { color: COLORS.muted, fontSize: 12, marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 16, marginTop: 12, borderWidth: 1, borderColor: COLORS.line },
  cardTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  muted: { color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  liftRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  liftName: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(28,48,82,0.08)', marginTop: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: COLORS.blue },
});
