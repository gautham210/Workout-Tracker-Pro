import React, { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Camera, ChevronRight, Dumbbell, Scale, Settings, Sparkles, Utensils } from 'lucide-react-native';
import GlassCard from '../../components/GlassCard';
import ProgressRing from '../../components/ProgressRing';
import StatusBanner from '../../components/StatusBanner';
import SyncPill from '../../components/SyncPill';
import MetricSkeleton from '../../components/MetricSkeleton';
import { useAuth } from '../../lib/AuthContext';
import { getLocalSession, LocalSession } from '../../lib/db';
import { computeHomeStats, formatDay, formatKg, relativeDays, sessionTitle } from '../../lib/analytics';
import { COLORS, useLocalSessions } from '../../lib/analyticsHooks';
import { generateInsights } from '../../lib/insights';
import { useTabBarInset } from '../../lib/layout';
import { describeDataError, fetchTargets, TargetsRow } from '../../lib/metricsData';
import { fetchFoodEntriesForDay, NutritionTotals, sumEntries } from '../../lib/nutritionData';
import { discardSession, findResumableSession } from '../../lib/workouts';

type NutritionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; totals: NutritionTotals; targets: TargetsRow | null };

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const inset = useTabBarInset();
  const { sessions, loading, error, reload } = useLocalSessions(user?.id);
  const [resumable, setResumable] = useState<LocalSession | null>(null);
  const [nutrition, setNutrition] = useState<NutritionState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => computeHomeStats(sessions), [sessions]);
  const { insights, focus } = useMemo(() => generateInsights(sessions), [sessions]);

  const loadResumable = useCallback(async () => {
    if (!user) { setResumable(null); return; }
    try {
      const id = await findResumableSession(user.id);
      setResumable(id ? await getLocalSession(user.id, id) : null);
    } catch (e) {
      console.warn('[home] resumable check failed', e);
      setResumable(null);
    }
  }, [user]);

  const loadNutrition = useCallback(async () => {
    if (!user) return;
    try {
      const [entries, targets] = await Promise.all([fetchFoodEntriesForDay(user.id, new Date()), fetchTargets(user.id)]);
      setNutrition({ status: 'ready', totals: sumEntries(entries), targets });
    } catch (e) {
      setNutrition({ status: 'error', message: describeDataError(e, "today's meals") });
    }
  }, [user]);

  useFocusEffect(useCallback(() => { loadResumable(); loadNutrition(); }, [loadResumable, loadNutrition]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([reload(), loadResumable(), loadNutrition()]);
    setRefreshing(false);
  }, [reload, loadResumable, loadNutrition]);

  const discard = () => {
    if (!user || !resumable) return;
    Alert.alert('Discard this workout?', 'The unfinished workout and anything you logged in it will be deleted from this device.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => {
        try { await discardSession(user.id, resumable.id); setResumable(null); } catch { Alert.alert('Could not discard', 'Please try again.'); }
      } },
    ]);
  };

  const identity = typeof user?.user_metadata?.name === 'string' && user.user_metadata.name.trim() ? user.user_metadata.name.trim() : user?.email?.split('@')[0] || 'Athlete';
  const resumeCount = resumable?.exercises.length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: inset.contentBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.blue} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>TODAY</Text>
            <Text style={styles.name} numberOfLines={1}>{identity}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10} onPress={() => router.push('/settings')} style={styles.iconBtn}>
            <Settings color={COLORS.ink} size={20} />
          </TouchableOpacity>
        </View>
        <SyncPill style={{ marginBottom: 14 }} />

        {error ? <StatusBanner kind="error" title="Workout history unavailable" message={error} actionLabel="Retry" onAction={reload} style={{ marginBottom: 14 }} /> : null}

        {resumable ? (
          <View style={styles.resumeCard}>
            <Text style={styles.resumeKicker}>UNFINISHED WORKOUT</Text>
            <Text style={styles.resumeTitle}>{sessionTitle(resumable)}</Text>
            <Text style={styles.resumeCopy}>
              Started {relativeDays(resumable.created_at)} · {resumeCount} exercise{resumeCount === 1 ? '' : 's'}. It is saved on this device.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity accessibilityRole="button" style={[styles.primaryBtn, { flex: 1 }]} onPress={() => router.push({ pathname: '/active-workout', params: { resumeSessionId: resumable.id } })}>
                <Text style={styles.primaryBtnText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={[styles.ghostBtn, { flex: 1 }]} onPress={discard}>
                <Text style={styles.ghostBtnText}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.stage}>
            <Text style={styles.stageKicker}>NEXT SESSION</Text>
            <Text style={styles.stageTitle}>{stats.last ? `Last: ${stats.last.title}` : 'Log your first workout'}</Text>
            <Text style={styles.stageCopy}>
              {stats.last
                ? `${formatDay(stats.last.date)} (${relativeDays(stats.last.date)}) · ${formatKg(stats.last.volume)} lifted${focus ? ` · ${focus.muscle} not trained for ${focus.daysSince} days` : ''}`
                : 'Finished workouts are stored on this device first, then synced to your account.'}
            </Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Start workout" style={styles.stageAction} onPress={() => router.push('/(tabs)/workout')}>
              <Text style={styles.stageActionText}>Start workout</Text><ChevronRight color="#0755a8" size={18} />
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>This week</Text>
        {loading ? <MetricSkeleton rows={1} height={92} /> : (
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={styles.statValue}>{stats.thisWeekCount}</Text><Text style={styles.statLabel}>workout{stats.thisWeekCount === 1 ? '' : 's'}</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{stats.thisWeekVolume ? formatKg(stats.thisWeekVolume).replace(' kg', '') : '0'}</Text><Text style={styles.statLabel}>kg volume</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{stats.weekStreak}</Text><Text style={styles.statLabel}>week streak</Text></View>
          </View>
        )}
        {!loading && !sessions.length && !error ? <Text style={styles.empty}>No finished workouts on this device yet. Stats appear after your first one.</Text> : null}

        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.grid}>
          <QuickAction icon={<Dumbbell color={COLORS.blueText} size={22} />} label="Start workout" onPress={() => router.push('/(tabs)/workout')} />
          <QuickAction icon={<Sparkles color="#5c3fb8" size={22} />} label="Ask Coach" onPress={() => router.push('/(tabs)/coach')} />
          <QuickAction icon={<Camera color="#9a5b00" size={22} />} label="Scan meal" onPress={() => router.push({ pathname: '/(tabs)/nutrition', params: { action: 'scan' } })} />
          <QuickAction icon={<Scale color={COLORS.green} size={22} />} label="Body metrics" onPress={() => router.push('/body-metrics')} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Nutrition today</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open nutrition journal" hitSlop={10} onPress={() => router.push('/(tabs)/nutrition')}>
            <Text style={styles.link}>Journal</Text>
          </TouchableOpacity>
        </View>
        <NutritionCard state={nutrition} onRetry={loadNutrition} onLog={() => router.push({ pathname: '/(tabs)/nutrition', params: { action: 'manual' } })} onSetTargets={() => router.push('/body-metrics')} />

        <Text style={styles.sectionTitle}>Training signal</Text>
        {loading ? <MetricSkeleton rows={2} /> : insights.map((insight) => (
          <GlassCard key={insight.id} style={styles.cardGap} contentStyle={{ padding: 16 }}>
            <Text style={styles.insightTitle}>{insight.title}</Text>
            <Text style={styles.insightText}>{insight.summary}</Text>
            <View style={styles.evidence}>
              <Text style={styles.evidenceLabel}>EVIDENCE</Text>
              {insight.evidence.map((line) => <Text key={line} style={styles.evidenceLine}>• {line}</Text>)}
            </View>
          </GlassCard>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      {icon}
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function NutritionCard({ state, onRetry, onLog, onSetTargets }: { state: NutritionState; onRetry: () => void; onLog: () => void; onSetTargets: () => void }) {
  if (state.status === 'loading') return <MetricSkeleton rows={1} height={110} />;
  if (state.status === 'error') return <StatusBanner kind="error" title="Nutrition unavailable" message={state.message} actionLabel="Retry" onAction={onRetry} />;
  const { totals, targets } = state;
  const target = targets?.calories ?? null;
  if (!totals.count) {
    return (
      <GlassCard contentStyle={{ padding: 16 }}>
        <View style={styles.row}>
          <Utensils color={COLORS.muted} size={20} />
          <Text style={[styles.insightText, { flex: 1 }]}>No meals logged today.{target ? ` Your calorie target is ${Math.round(target)} kcal.` : ' No calorie target is set yet.'}</Text>
        </View>
        <View style={[styles.row, { marginTop: 12 }]}>
          <TouchableOpacity accessibilityRole="button" style={[styles.primaryBtn, { flex: 1 }]} onPress={onLog}><Text style={styles.primaryBtnText}>Log a meal</Text></TouchableOpacity>
          {!target ? <TouchableOpacity accessibilityRole="button" style={[styles.ghostBtn, { flex: 1 }]} onPress={onSetTargets}><Text style={styles.ghostBtnText}>Set targets</Text></TouchableOpacity> : null}
        </View>
      </GlassCard>
    );
  }
  return (
    <GlassCard contentStyle={{ padding: 16 }}>
      <View style={styles.row}>
        <ProgressRing size={96} strokeWidth={9} progress={target ? (totals.calories / target) * 100 : 0} label={`${Math.round(totals.calories)}`} caption="kcal" activeColor={COLORS.blue}
          accessibilityLabel={`${Math.round(totals.calories)} kilocalories${target ? ` of ${Math.round(target)}` : ''}`} />
        <View style={{ flex: 1 }}>
          <Text style={styles.insightText}>{target ? `${Math.round(totals.calories)} of ${Math.round(target)} kcal` : `${Math.round(totals.calories)} kcal logged · no target set`}</Text>
          <Text style={styles.evidenceLine}>Protein {Math.round(totals.protein_g)}{targets?.protein_g ? ` / ${targets.protein_g}` : ''} g</Text>
          <Text style={styles.evidenceLine}>Carbs {Math.round(totals.carbs_g)}{targets?.carbs_g ? ` / ${targets.carbs_g}` : ''} g</Text>
          <Text style={styles.evidenceLine}>Fat {Math.round(totals.fat_g)}{targets?.fat_g ? ` / ${targets.fat_g}` : ''} g</Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  header: { marginTop: 8, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  overline: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  name: { color: COLORS.ink, fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stage: { borderRadius: 28, backgroundColor: '#0b5fc4', padding: 22, minHeight: 190, marginBottom: 6 },
  stageKicker: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  stageTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.8, marginTop: 8 },
  stageCopy: { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 19, marginTop: 8 },
  stageAction: { marginTop: 18, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, gap: 6, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center' },
  stageActionText: { color: '#0755a8', fontSize: 14, fontWeight: '800' },
  resumeCard: { borderRadius: 24, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#f0b429', padding: 18, marginBottom: 6 },
  resumeKicker: { color: COLORS.amber, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  resumeTitle: { color: COLORS.ink, fontSize: 22, fontWeight: '800', marginTop: 4 },
  resumeCopy: { color: COLORS.body, fontSize: 13, lineHeight: 19, marginVertical: 8 },
  primaryBtn: { minHeight: 46, borderRadius: 14, backgroundColor: COLORS.blueText, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  ghostBtn: { minHeight: 46, borderRadius: 14, backgroundColor: '#eef2f8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  ghostBtnText: { color: COLORS.ink, fontWeight: '700', fontSize: 14 },
  sectionTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginTop: 24, marginBottom: 12 },
  sectionTitleInline: { color: COLORS.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  link: { color: COLORS.blueText, fontWeight: '700', fontSize: 14, paddingVertical: 8 },
  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.line },
  statValue: { color: COLORS.ink, fontSize: 24, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  empty: { color: COLORS.muted, fontSize: 13, marginTop: 10, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { width: '48%', flexGrow: 1, minHeight: 84, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, gap: 8 },
  actionText: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  cardGap: { marginBottom: 12 },
  insightTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  insightText: { color: COLORS.body, fontSize: 14, lineHeight: 20 },
  evidence: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.line },
  evidenceLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  evidenceLine: { color: COLORS.body, fontSize: 13, lineHeight: 19 },
});
