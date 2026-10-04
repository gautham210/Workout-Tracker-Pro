import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Scale } from 'lucide-react-native';
import ChartBars from '../../components/ChartBars';
import ExerciseVisual from '../../components/ExerciseVisual';
import MetricSkeleton from '../../components/MetricSkeleton';
import MetricSyncBadge from '../../components/MetricSyncBadge';
import StatusBanner from '../../components/StatusBanner';
import { useAuth } from '../../lib/AuthContext';
import { listLocalFinishedSessions, LocalSession } from '../../lib/db';
import {
  computeHomeStats, countFinishedSessions, formatDay, formatKg, sessionSetCounts, sessionTitle, sessionVolume, summarizeExercises, weeklyVolume, workoutsInLastDays,
} from '../../lib/analytics';
import { COLORS, useLocalSessions } from '../../lib/analyticsHooks';
import { useTabBarInset } from '../../lib/layout';
import { describeDataError, fetchWeightHistory, WeightPoint } from '../../lib/metricsData';
import { useSyncState } from '../../lib/useSyncState';

const PAGE = 20;

export default function ProgressScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const inset = useTabBarInset();
  const syncState = useSyncState();
  const analytics = useLocalSessions(user?.id, 200);

  const [items, setItems] = useState<LocalSession[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const itemsLength = useRef(0);
  itemsLength.current = items.length;
  const requestId = useRef(0);

  const [weights, setWeights] = useState<WeightPoint[]>([]);
  const [weightState, setWeightState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [weightError, setWeightError] = useState('');

  const loadList = useCallback(async (reset: boolean) => {
    if (!user) return;
    const id = ++requestId.current;
    try {
      const limit = reset ? Math.max(PAGE, itemsLength.current) : PAGE;
      const offset = reset ? 0 : itemsLength.current;
      const [rows, count] = await Promise.all([listLocalFinishedSessions(user.id, limit, offset), countFinishedSessions(user.id)]);
      if (id !== requestId.current) return;
      setItems((prev) => (reset ? rows : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]));
      setTotal(count); setListError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setListError(e instanceof Error ? e.message : 'Workout history could not be read from this device.');
    } finally {
      if (id === requestId.current) { setListLoading(false); setLoadingMore(false); }
    }
  }, [user]);

  const loadWeights = useCallback(async () => {
    if (!user) return;
    setWeightState((s) => (s === 'ready' ? s : 'loading'));
    try { setWeights(await fetchWeightHistory(user.id)); setWeightState('ready'); }
    catch (e) { setWeightError(describeDataError(e, 'your weight history')); setWeightState('error'); }
  }, [user]);

  useFocusEffect(useCallback(() => { loadList(true); loadWeights(); }, [loadList, loadWeights]));
  // Per-session sync badges follow the outbox: refresh the visible pages when sync state changes.
  useEffect(() => { if (!listLoading) loadList(true); }, [syncState]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadList(true), analytics.reload(), loadWeights()]);
    setRefreshing(false);
  };
  const loadMore = () => {
    if (loadingMore || listLoading || items.length >= total || listError) return;
    setLoadingMore(true); loadList(false);
  };

  const stats = useMemo(() => computeHomeStats(analytics.sessions), [analytics.sessions]);
  const monthCount = useMemo(() => workoutsInLastDays(analytics.sessions, 30), [analytics.sessions]);
  const weeks = useMemo(() => weeklyVolume(analytics.sessions, 8), [analytics.sessions]);
  const exercises = useMemo(() => summarizeExercises(analytics.sessions).slice(0, 6), [analytics.sessions]);

  const header = (
    <View>
      <Text accessibilityRole="header" style={styles.title}>Progress</Text>
      {analytics.error ? <StatusBanner kind="error" title="Could not read local workouts" message={analytics.error} actionLabel="Retry" onAction={analytics.reload} style={{ marginBottom: 12 }} /> : null}

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Body weight</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open body metrics" hitSlop={10} onPress={() => router.push('/body-metrics')} style={styles.linkRow}>
            <Scale color={COLORS.blueText} size={16} /><Text style={styles.link}>Body metrics</Text>
          </TouchableOpacity>
        </View>
        <WeightTrend state={weightState} points={weights} error={weightError} onRetry={loadWeights} />
      </View>

      <View style={styles.statRow}>
        <Stat value={analytics.loading ? '…' : String(monthCount)} label="workouts, last 30 days" />
        <Stat value={analytics.loading ? '…' : stats.thisWeekVolume ? formatKg(stats.thisWeekVolume).replace(' kg', '') : '0'} label="kg this week" />
        <Stat value={analytics.loading ? '…' : String(stats.weekStreak)} label="week streak" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly volume</Text>
        <Text style={styles.cardNote}>Completed working sets (weight × reps), last 8 weeks. Warm-ups are excluded.</Text>
        {analytics.loading ? <MetricSkeleton rows={1} height={120} /> : weeks.every((w) => w.volume === 0)
          ? <Text style={styles.empty}>No completed working sets in the last 8 weeks.</Text>
          : <ChartBars data={weeks.map((w) => ({ label: w.label, value: w.volume, shown: w.volume >= 1000 ? `${(w.volume / 1000).toFixed(1)}k` : String(w.volume) }))} summaryLabel="Weekly training volume in kilograms" />}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Strength estimates</Text>
        <Text style={styles.cardNote}>Estimated 1RM from your best weight × reps (+ reps in reserve). An estimate, not a tested max. Based on your latest {Math.min(analytics.sessions.length, 200)} workouts.</Text>
        {analytics.loading ? <MetricSkeleton rows={2} height={56} /> : exercises.length === 0
          ? <Text style={styles.empty}>Log completed sets with weight and reps to see estimates here.</Text>
          : exercises.map((e) => (
            <View key={e.exerciseId} style={styles.exRow}>
              <ExerciseVisual name={e.name} muscle={e.muscle} size={44} radius={12} />
              <View style={{ flex: 1 }}>
                <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
                <Text style={styles.exMeta}>{Math.round(e.bestE1rm)} kg est. 1RM · {e.sessions} session{e.sessions === 1 ? '' : 's'}</Text>
                <View style={styles.tagRow}>
                  {e.recentPR ? <Text style={[styles.tag, styles.tagGood]}>PR in last 30 days (+{Math.max(1, Math.round(e.recentPR.e1rm - e.recentPR.previous))} kg)</Text> : null}
                  {e.plateau ? <Text style={[styles.tag, styles.tagWarn]}>Possible plateau</Text> : null}
                </View>
              </View>
            </View>
          ))}
      </View>

      <Text style={styles.sectionTitle}>Workouts</Text>
      {listError ? <StatusBanner kind="error" title="Could not load workouts" message={listError} actionLabel="Retry" onAction={() => { setListLoading(true); loadList(true); }} /> : null}
      {listLoading ? <MetricSkeleton rows={3} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <SessionRow session={item} onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })} />}
        ListEmptyComponent={!listLoading && !listError ? <Text style={styles.empty}>No finished workouts on this device yet. Completed sessions will appear here, even offline.</Text> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={COLORS.blue} /> : items.length < total && !listError ? (
          <TouchableOpacity accessibilityRole="button" onPress={loadMore} style={styles.moreBtn}><Text style={styles.link}>Load more ({total - items.length} left)</Text></TouchableOpacity>
        ) : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.blue} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: inset.contentBottom }}
      />
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function WeightTrend({ state, points, error, onRetry }: { state: 'loading' | 'ready' | 'error'; points: WeightPoint[]; error: string; onRetry: () => void }) {
  if (state === 'loading') return <MetricSkeleton rows={1} height={110} />;
  if (state === 'error') return <StatusBanner kind="error" message={error} actionLabel="Retry" onAction={onRetry} />;
  if (!points.length) return <Text style={styles.empty}>No weight entries yet. Add your weight in Body metrics to see a trend.</Text>;
  const recent = points.slice(-12);
  const latest = points[points.length - 1];
  const first = points.length > 1 ? points[points.length - 2] : null;
  const lo = Math.min(...recent.map((p) => p.weightKg)); const hi = Math.max(...recent.map((p) => p.weightKg));
  const floor = lo - Math.max(1, (hi - lo) * 0.6);
  const delta = first ? latest.weightKg - first.weightKg : null;
  return (
    <View>
      <Text style={styles.weightValue}>{latest.weightKg.toFixed(1)} kg</Text>
      <Text style={styles.cardNote}>
        {formatDay(latest.date, { month: 'short', day: 'numeric' })}{delta !== null ? ` · ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg since ${formatDay(first!.date, { month: 'short', day: 'numeric' })}` : ' · only one entry so far'}
      </Text>
      {recent.length > 1 ? (
        <View style={{ marginTop: 8 }}>
          <ChartBars height={90} color={COLORS.green} summaryLabel="Body weight in kilograms"
            data={recent.map((p) => ({ label: formatDay(p.date, { month: 'numeric', day: 'numeric' }), value: p.weightKg - floor, shown: p.weightKg.toFixed(1) }))} />
          <Text style={styles.cardNote}>Bars are scaled to your own range, not from zero.</Text>
        </View>
      ) : null}
    </View>
  );
}

function SessionRow({ session, onPress }: { session: LocalSession; onPress: () => void }) {
  const sets = sessionSetCounts(session);
  const vol = sessionVolume(session);
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${sessionTitle(session)}, ${formatDay(session.date)}. Open details`} onPress={onPress} style={styles.session}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.sessionDate}>{formatDay(session.date)}</Text>
        <Text style={styles.sessionTitle} numberOfLines={1}>{sessionTitle(session)}</Text>
        <Text style={styles.sessionMeta}>
          {session.duration_minutes ? `${session.duration_minutes} min · ` : ''}{session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'} · {sets.working} sets · {vol ? formatKg(vol) : 'no weighted volume'}
        </Text>
        <MetricSyncBadge state={session.sync_state} />
      </View>
      <ChevronRight color={COLORS.faint} size={22} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  title: { color: COLORS.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 16, marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.line },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  cardNote: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 8 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  link: { color: COLORS.blueText, fontWeight: '700', fontSize: 14 },
  weightValue: { color: COLORS.ink, fontSize: 28, fontWeight: '800', marginTop: 6 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line },
  statValue: { color: COLORS.ink, fontSize: 22, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  empty: { color: COLORS.muted, fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  exRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 },
  exName: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  exMeta: { color: COLORS.muted, fontSize: 12, marginTop: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { fontSize: 11, fontWeight: '800', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  tagGood: { backgroundColor: COLORS.greenSoft, color: '#14633f' },
  tagWarn: { backgroundColor: COLORS.amberSoft, color: COLORS.amber },
  sectionTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800', marginTop: 12, marginBottom: 12 },
  session: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.line, minHeight: 64 },
  sessionDate: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  sessionTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  sessionMeta: { color: COLORS.body, fontSize: 12 },
  moreBtn: { alignItems: 'center', paddingVertical: 14 },
});
