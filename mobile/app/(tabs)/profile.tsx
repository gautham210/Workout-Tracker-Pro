import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Scale, Settings2, Users, Utensils } from 'lucide-react-native';
import MetricSignOut from '../../components/MetricSignOut';
import MetricSkeleton from '../../components/MetricSkeleton';
import StatusBanner from '../../components/StatusBanner';
import { useAuth } from '../../lib/AuthContext';
import { COLORS } from '../../lib/analyticsHooks';
import { useTabBarInset } from '../../lib/layout';
import { activityLabel, goalLabel } from '../../lib/metrics';
import { describeDataError, fetchProfileMetrics, fetchTargets, fetchWeightHistory, ProfileMetrics, TargetsRow, WeightPoint } from '../../lib/metricsData';

type Summary = { profile: ProfileMetrics | null; targets: TargetsRow | null; weight: WeightPoint | null };

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const inset = useTabBarInset();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profile, targets, weights] = await Promise.all([fetchProfileMetrics(user.id), fetchTargets(user.id), fetchWeightHistory(user.id, 1)]);
      setSummary({ profile, targets, weight: weights[weights.length - 1] ?? null }); setState('ready'); setError('');
    } catch (e) { setError(describeDataError(e, 'your profile details')); setState('error'); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const metaName = typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';
  const identity = summary?.profile?.name?.trim() || metaName || user?.email?.split('@')[0] || 'Athlete';
  const p = summary?.profile;
  const age = p?.age ?? (p?.birth_year ? new Date().getFullYear() - p.birth_year : null);
  const hasMetrics = !!(p?.height_cm || summary?.weight || p?.training_goal || p?.activity_level);

  const facts: [string, string][] = summary ? [
    ['Height', p?.height_cm ? `${p.height_cm} cm` : '—'],
    ['Weight', summary.weight ? `${summary.weight.weightKg.toFixed(1)} kg` : '—'],
    ['Age', age ? String(age) : '—'],
    ['Sex', p?.sex && p.sex !== 'unspecified' ? p.sex[0].toUpperCase() + p.sex.slice(1) : '—'],
    ['Goal', goalLabel(p?.training_goal) ?? '—'],
    ['Activity', activityLabel(p?.activity_level) ?? '—'],
  ] : [];
  const t = summary?.targets;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: inset.contentBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.blue} />}>
        <View style={styles.hero}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no"><Text style={styles.avatarText}>{identity.slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.eyebrow}>ATHLETE PROFILE</Text>
            <Text style={styles.name} numberOfLines={1}>{identity}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Body metrics</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit body metrics" hitSlop={10} onPress={() => router.push('/body-metrics')}><Text style={styles.link}>{hasMetrics ? 'Edit' : 'Add'}</Text></TouchableOpacity>
          </View>
          {state === 'loading' ? <MetricSkeleton rows={1} height={90} /> : null}
          {state === 'error' ? <StatusBanner kind="error" message={error} actionLabel="Retry" onAction={load} /> : null}
          {state === 'ready' && !hasMetrics ? <Text style={styles.muted}>No body metrics saved yet. Add your height, weight, and goal to get calorie and macro estimates.</Text> : null}
          {state === 'ready' && hasMetrics ? (
            <>
              <View style={styles.facts}>
                {facts.map(([k, v]) => <View key={k} style={styles.fact}><Text style={styles.factLabel}>{k}</Text><Text style={styles.factValue}>{v}</Text></View>)}
              </View>
              <Text style={styles.muted}>
                {t?.calories ? `Daily targets: ${t.calories} kcal · P ${t.protein_g ?? '—'} g · C ${t.carbs_g ?? '—'} g · F ${t.fat_g ?? '—'} g` : 'No nutrition targets saved yet.'}
              </Text>
            </>
          ) : null}
        </View>

        <Row icon={<Scale color={COLORS.blueText} size={19} />} bg="#dff0ff" title="Body metrics" detail="Measurements, estimates, and targets" onPress={() => router.push('/body-metrics')} />
        <Row icon={<Utensils color={COLORS.green} size={19} />} bg={COLORS.greenSoft} title="Nutrition journal" detail="Meals, scans, and daily totals" onPress={() => router.push('/(tabs)/nutrition')} />
        <Row icon={<Users color="#4a43b5" size={19} />} bg="#ece9ff" title="Athlete space" detail="Your own stats, from this device" onPress={() => router.push('/athlete-space')} />
        <Row icon={<Settings2 color={COLORS.blueText} size={19} />} bg="#dff0ff" title="Settings & import" detail="Workout import, sync, account" onPress={() => router.push('/settings')} />
        <View style={{ marginTop: 14 }}><MetricSignOut /></View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, bg, title, detail, onPress }: { icon: React.ReactNode; bg: string; title: string; detail: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} style={styles.row} onPress={onPress}>
      <View style={[styles.rowIcon, { backgroundColor: bg }]}>{icon}</View>
      <View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View>
      <ChevronRight color={COLORS.faint} size={20} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingTop: 20 },
  hero: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatar: { width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1f6fd0' },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  name: { color: COLORS.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
  email: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.line },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  link: { color: COLORS.blueText, fontWeight: '700', fontSize: 14, paddingVertical: 6 },
  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  fact: { width: '31%', flexGrow: 1, backgroundColor: '#f3f6fb', borderRadius: 12, padding: 10 },
  factLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  factValue: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 13, marginBottom: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', minHeight: 64 },
  rowIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  rowDetail: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
});
