import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Play } from 'lucide-react-native';
import ExerciseVisual from './ExerciseVisual';
import { useAuth } from '../lib/AuthContext';
import { COLORS } from '../lib/analyticsHooks';
import { listCachedExercises, fetchAndCacheCatalog } from '../lib/db';
import { createSessionFromPlan, discardSession, findResumableSession, matchExerciseName, PlannedExercise } from '../lib/workouts';

type RawPlanExercise = {
  exerciseId?: string; name?: string; sets?: number; repsMin?: number; repsMax?: number; rir?: number | null; rpe?: number | null;
  weightKg?: number | null; restSeconds?: number | null; warmup?: boolean; notes?: string | null;
};
export type RawPlan = {
  title?: string; goal?: string | null; target?: string | null; estimatedMinutes?: number | null; notes?: string | null;
  unmatched?: string[]; exercises?: RawPlanExercise[];
};
export type ResolvedPlanExercise = PlannedExercise & { name: string; muscle: string | null };
export type ResolvedPlan = {
  title: string; goal: string | null; target: string | null; estimatedMinutes: number | null; notes: string | null;
  exercises: ResolvedPlanExercise[]; unmatched: string[];
};

const num = (v: unknown): number | undefined => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Resolves AI plan exercises against the local catalogue. Anything that cannot be matched is reported, never guessed. */
export async function resolvePlan(raw: RawPlan): Promise<ResolvedPlan> {
  let catalog = await listCachedExercises('', 2000);
  const attempt = (): { resolved: ResolvedPlanExercise[]; missing: string[] } => {
    const resolved: ResolvedPlanExercise[] = []; const missing: string[] = [];
    for (const ex of raw.exercises ?? []) {
      const label = String(ex.name ?? ex.exerciseId ?? 'Unnamed exercise').slice(0, 80);
      const byId = ex.exerciseId ? catalog.find((c) => c.id === ex.exerciseId) : undefined;
      const matched = byId ?? (ex.name ? (matchExerciseName(ex.name, catalog) as { id: string; name: string } | null) : null);
      if (!matched) { missing.push(label); continue; }
      const full = catalog.find((c) => c.id === matched.id);
      const repsMin = num(ex.repsMin); const repsMax = num(ex.repsMax);
      resolved.push({
        exerciseId: matched.id, name: full?.name ?? matched.name, muscle: full?.muscle_group ?? null,
        sets: Math.max(1, Math.min(20, Math.round(num(ex.sets) ?? 3))), repsMin, repsMax: repsMax ?? repsMin,
        rir: num(ex.rir) ?? null, rpe: num(ex.rpe) ?? null, restSeconds: num(ex.restSeconds) ?? null, weightKg: num(ex.weightKg) ?? null,
        warmup: ex.warmup === true, notes: typeof ex.notes === 'string' ? ex.notes.slice(0, 500) : null,
      });
    }
    return { resolved, missing };
  };
  let { resolved, missing } = attempt();
  if (missing.length || !catalog.length) {
    // The local catalogue may be empty or stale: refresh once (falls back to cache when offline), then re-resolve.
    try { catalog = (await fetchAndCacheCatalog()).exercises; ({ resolved, missing } = attempt()); } catch { /* keep first result */ }
  }
  const serverUnmatched = (raw.unmatched ?? []).map((n) => String(n).slice(0, 80)).filter((n) => !missing.includes(n));
  return {
    title: String(raw.title || 'Suggested workout').slice(0, 120), goal: raw.goal ?? null, target: raw.target ?? null,
    estimatedMinutes: num(raw.estimatedMinutes) ?? null, notes: raw.notes ?? null, exercises: resolved, unmatched: [...missing, ...serverUnmatched],
  };
}

export default function PlanCard({ plan }: { plan: ResolvedPlan }) {
  const router = useRouter();
  const { user } = useAuth();
  const [starting, setStarting] = useState(false);

  const create = async () => {
    if (!user) return;
    setStarting(true);
    try {
      const id = await createSessionFromPlan(user.id, { title: plan.title, goal: plan.goal, notes: plan.notes, exercises: plan.exercises.map(({ name: _n, muscle: _m, ...rest }) => rest) });
      router.push({ pathname: '/active-workout', params: { resumeSessionId: id } });
    } catch (e) {
      Alert.alert('Could not start workout', e instanceof Error ? e.message : 'Please try again.');
    } finally { setStarting(false); }
  };

  const start = async () => {
    if (!user || starting || !plan.exercises.length) return;
    setStarting(true);
    let existing: string | null = null;
    try { existing = await findResumableSession(user.id); } catch { /* treat as none */ }
    setStarting(false);
    if (!existing) { create(); return; }
    Alert.alert('Unfinished workout found', 'You already have a workout in progress on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resume it', onPress: () => router.push({ pathname: '/active-workout', params: { resumeSessionId: existing! } }) },
      { text: 'Discard and start this', style: 'destructive', onPress: async () => { try { await discardSession(user.id, existing!); } catch { /* create anyway */ } create(); } },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>SUGGESTED WORKOUT</Text>
      <Text style={styles.title}>{plan.title}</Text>
      <Text style={styles.meta}>
        {[plan.goal, plan.target, plan.estimatedMinutes ? `about ${plan.estimatedMinutes} min (estimate)` : null].filter(Boolean).join(' · ') || 'Review before you start'}
      </Text>
      {plan.notes ? <Text style={styles.notes}>{plan.notes}</Text> : null}
      {plan.exercises.map((ex, i) => {
        const reps = ex.repsMin && ex.repsMax && ex.repsMax !== ex.repsMin ? `${ex.repsMin}-${ex.repsMax}` : ex.repsMin ? `${ex.repsMin}` : '?';
        return (
          <View key={`${ex.exerciseId}-${i}`} style={styles.ex}>
            <ExerciseVisual name={ex.name} muscle={ex.muscle} size={48} radius={12} />
            <View style={{ flex: 1 }}>
              <Text style={styles.exName}>{ex.name}</Text>
              <Text style={styles.exMeta}>
                {ex.sets} × {reps} reps{ex.rir != null ? ` · ${ex.rir} RIR` : ''}{ex.rpe != null ? ` · RPE ${ex.rpe}` : ''}{ex.restSeconds ? ` · rest ${ex.restSeconds}s` : ''}{ex.weightKg ? ` · ${ex.weightKg} kg` : ''}{ex.warmup ? ' · warm-up set' : ''}
              </Text>
              {ex.notes ? <Text style={styles.exNote}>{ex.notes}</Text> : null}
            </View>
          </View>
        );
      })}
      {plan.unmatched.length ? (
        <View style={styles.unmatched}>
          <Text style={styles.unmatchedTitle}>Not in your exercise library, left out</Text>
          <Text style={styles.unmatchedText}>{plan.unmatched.join(', ')}</Text>
        </View>
      ) : null}
      {!plan.exercises.length ? <Text style={styles.unmatchedText}>None of the suggested exercises could be matched, so this plan cannot be started. Ask the coach to try again.</Text> : null}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Start workout from this plan" disabled={starting || !plan.exercises.length} onPress={start}
        style={[styles.btn, (starting || !plan.exercises.length) && { opacity: 0.5 }]}>
        {starting ? <ActivityIndicator color="#fff" /> : <><Play color="#fff" size={16} /><Text style={styles.btnText}>Start workout</Text></>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 14, marginTop: 8, borderWidth: 1, borderColor: COLORS.line, alignSelf: 'stretch' },
  kicker: { color: COLORS.blueText, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: COLORS.ink, fontSize: 18, fontWeight: '800', marginTop: 4 },
  meta: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  notes: { color: COLORS.body, fontSize: 13, lineHeight: 18, marginTop: 8 },
  ex: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.line, marginTop: 8 },
  exName: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  exMeta: { color: COLORS.body, fontSize: 12, marginTop: 1 },
  exNote: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  unmatched: { backgroundColor: COLORS.amberSoft, borderRadius: 12, padding: 10, marginTop: 8 },
  unmatchedTitle: { color: COLORS.amber, fontSize: 12, fontWeight: '800' },
  unmatchedText: { color: COLORS.amber, fontSize: 12, marginTop: 2, lineHeight: 17 },
  btn: { minHeight: 48, borderRadius: 14, backgroundColor: COLORS.blueText, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
