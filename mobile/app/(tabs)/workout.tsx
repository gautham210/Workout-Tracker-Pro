import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Minus, Play, Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { CachedExercise, getLocalSession } from '../../lib/db';
import { useTabBarInset } from '../../lib/layout';
import { createSessionFromPlan, discardSession, findResumableSession } from '../../lib/workouts';
import ExerciseCatalogBrowser from '../../components/ExerciseCatalogBrowser';
import ExerciseVisual from '../../components/ExerciseVisual';
import StatusBanner from '../../components/StatusBanner';

type BuilderItem = { key: string; exercise: CachedExercise; sets: number; reps: number; warmup: boolean };
type ResumeInfo = { id: string; title: string; exercises: number; completedSets: number; started: string };

const Stepper = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) => (
  <View style={styles.stepper}>
    <Text style={styles.stepLabel}>{label}</Text>
    <View style={styles.stepRow}>
      <TouchableOpacity onPress={() => onChange(Math.max(min, value - 1))} hitSlop={8} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}>
        <Minus size={16} color="#24324a" />
      </TouchableOpacity>
      <Text style={styles.stepValue} accessibilityLabel={`${value} ${label}`}>{value}</Text>
      <TouchableOpacity onPress={() => onChange(Math.min(max, value + 1))} hitSlop={8} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Increase ${label}`}>
        <Plus size={16} color="#24324a" />
      </TouchableOpacity>
    </View>
  </View>
);

const BuilderRow = memo(function BuilderRow({ item, index, last, onMove, onRemove, onPatch }: {
  item: BuilderItem; index: number; last: boolean;
  onMove: (key: string, dir: -1 | 1) => void; onRemove: (key: string) => void; onPatch: (key: string, patch: Partial<BuilderItem>) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <ExerciseVisual name={item.exercise.name} muscle={item.exercise.muscle_group} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={2}>{item.exercise.name}</Text>
          <Text style={styles.cardMuscle}>{item.exercise.muscle_group || 'Movement'}</Text>
        </View>
        <TouchableOpacity disabled={index === 0} onPress={() => onMove(item.key, -1)} hitSlop={8} style={[styles.iconBtn, index === 0 && styles.dim]} accessibilityRole="button" accessibilityLabel={`Move ${item.exercise.name} up`}>
          <ArrowUp size={18} color="#24324a" />
        </TouchableOpacity>
        <TouchableOpacity disabled={last} onPress={() => onMove(item.key, 1)} hitSlop={8} style={[styles.iconBtn, last && styles.dim]} accessibilityRole="button" accessibilityLabel={`Move ${item.exercise.name} down`}>
          <ArrowDown size={18} color="#24324a" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onRemove(item.key)} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`Remove ${item.exercise.name}`}>
          <Trash2 size={18} color="#b4443d" />
        </TouchableOpacity>
      </View>
      <View style={styles.cardBottom}>
        <Stepper label="Sets" value={item.sets} min={1} max={10} onChange={(v) => onPatch(item.key, { sets: v })} />
        <Stepper label="Reps" value={item.reps} min={1} max={50} onChange={(v) => onPatch(item.key, { reps: v })} />
        <TouchableOpacity
          onPress={() => onPatch(item.key, { warmup: !item.warmup })} style={[styles.warm, item.warmup && styles.warmOn]}
          accessibilityRole="switch" accessibilityState={{ checked: item.warmup }} accessibilityLabel="Add a warm-up set"
        >
          <Text style={[styles.warmText, item.warmup && styles.warmTextOn]}>Warm-up set</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function WorkoutBuilderScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const inset = useTabBarInset();
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const counter = useRef(0);
  const userId = user?.id;

  const refreshResume = useCallback(async () => {
    if (!userId) { setResume(null); return; }
    try {
      const id = await findResumableSession(userId);
      if (!id) { setResume(null); return; }
      const s = await getLocalSession(userId, id);
      if (!s) { setResume(null); return; }
      setResume({
        id, title: s.title || 'Unfinished workout', exercises: s.exercises.length, started: s.created_at,
        completedSets: s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.completed).length, 0),
      });
    } catch { setResume(null); }
  }, [userId]);
  useFocusEffect(useCallback(() => { setStarting(false); refreshResume(); }, [refreshResume]));

  const addExercise = useCallback((exercise: CachedExercise) => {
    setStartError(null);
    setItems((cur) => (cur.some((i) => i.exercise.id === exercise.id) ? cur
      : [...cur, { key: `b${counter.current++}`, exercise, sets: 3, reps: 10, warmup: false }]));
  }, []);
  const move = useCallback((key: string, dir: -1 | 1) => setItems((cur) => {
    const i = cur.findIndex((x) => x.key === key); const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return cur;
    const next = cur.slice(); [next[i], next[j]] = [next[j], next[i]]; return next;
  }), []);
  const remove = useCallback((key: string) => setItems((cur) => cur.filter((x) => x.key !== key)), []);
  const patch = useCallback((key: string, p: Partial<BuilderItem>) => setItems((cur) => cur.map((x) => (x.key === key ? { ...x, ...p } : x))), []);

  const start = useCallback(async () => {
    if (!userId || starting || !items.length) return;
    setStarting(true); setStartError(null);
    try {
      const id = await createSessionFromPlan(userId, {
        exercises: items.map((i) => ({ exerciseId: i.exercise.id, sets: i.sets, reps: i.reps, warmup: i.warmup })),
      });
      setItems([]);
      router.push({ pathname: '/active-workout', params: { resumeSessionId: id } });
    } catch (e) {
      setStartError(String((e as { message?: string })?.message ?? 'Could not start the workout.'));
      setStarting(false);
    }
  }, [userId, starting, items, router]);

  const confirmDiscard = useCallback(() => {
    if (!resume || !userId) return;
    Alert.alert('Discard unfinished workout?', 'The sets you logged in it will be deleted from this device. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { discardSession(userId, resume.id).catch(() => undefined).then(refreshResume); } },
    ]);
  }, [resume, userId, refreshResume]);

  const selectedIds = useMemo(() => items.map((i) => i.exercise.id), [items]);

  const header = (
    <View>
      <Text style={styles.overline}>TRAIN</Text>
      <Text style={styles.title}>Build your workout</Text>
      <Text style={styles.copy}>Pick exercises from the library below, set your targets, then log each set as you go.</Text>

      {resume ? (
        <View style={styles.resume} accessibilityRole="summary">
          <Text style={styles.resumeTitle}>Resume unfinished workout</Text>
          <Text style={styles.resumeCopy}>
            {`${resume.title} · ${resume.exercises} exercise${resume.exercises === 1 ? '' : 's'} · ${resume.completedSets} set${resume.completedSets === 1 ? '' : 's'} done`}
          </Text>
          <View style={styles.resumeActions}>
            <TouchableOpacity style={styles.resumeBtn} onPress={() => router.push({ pathname: '/active-workout', params: { resumeSessionId: resume.id } })} accessibilityRole="button" accessibilityLabel="Resume unfinished workout">
              <Text style={styles.resumeBtnText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.discardBtn} onPress={confirmDiscard} accessibilityRole="button" accessibilityLabel="Discard unfinished workout">
              <Text style={styles.discardText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={styles.label}>{`YOUR WORKOUT${items.length ? ` (${items.length})` : ''}`}</Text>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No exercises selected</Text>
          <Text style={styles.emptyCopy}>Tap the + next to an exercise below to add it. Tap a row to see form cues first.</Text>
        </View>
      ) : items.map((item, index) => (
        <BuilderRow key={item.key} item={item} index={index} last={index === items.length - 1} onMove={move} onRemove={remove} onPatch={patch} />
      ))}
      {startError ? <StatusBanner kind="error" title="Could not start" message={startError} style={{ marginTop: 10 }} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ExerciseCatalogBrowser selectedIds={selectedIds} onAdd={addExercise} header={header} contentBottom={items.length ? inset.contentBottom + 76 : inset.contentBottom} />
      {items.length ? (
        <View style={[styles.footer, { paddingBottom: inset.contentBottom - 8 }]} pointerEvents="box-none">
          <TouchableOpacity style={[styles.start, starting && styles.dim]} onPress={start} disabled={starting} accessibilityRole="button"
            accessibilityLabel={`Start workout with ${items.length} exercises`}>
            <Play color="#fff" size={20} fill="#fff" />
            <Text style={styles.startText}>{starting ? 'Starting…' : `Start workout · ${items.length}`}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f8fc' },
  overline: { color: '#7b8799', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginTop: 16 },
  title: { color: '#172033', fontSize: 30, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  copy: { color: '#68758a', fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 16 },
  label: { color: '#78869a', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9 },
  resume: { backgroundColor: '#eaf4ff', borderColor: '#bcddfb', borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 16 },
  resumeTitle: { color: '#12507f', fontSize: 15, fontWeight: '800' },
  resumeCopy: { color: '#12507f', fontSize: 13, marginTop: 4 },
  resumeActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  resumeBtn: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#007aff', alignItems: 'center', justifyContent: 'center' },
  resumeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  discardBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  discardText: { color: '#b4443d', fontWeight: '800', fontSize: 15 },
  empty: { alignItems: 'center', padding: 22, borderWidth: 1, borderRadius: 20, borderColor: '#c9d6e6', borderStyle: 'dashed', marginBottom: 14 },
  emptyTitle: { color: '#172033', fontSize: 17, fontWeight: '800' },
  emptyCopy: { color: '#68758a', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6, maxWidth: 270 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e3eaf3' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { color: '#172033', fontSize: 15, fontWeight: '700' },
  cardMuscle: { color: '#748198', fontSize: 12, marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f0f3f8', alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  stepper: { alignItems: 'flex-start' },
  stepLabel: { color: '#78869a', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f0f3f8', alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 28, textAlign: 'center', color: '#172033', fontSize: 16, fontWeight: '800' },
  warm: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#f0f3f8', justifyContent: 'center', marginLeft: 'auto' },
  warmOn: { backgroundColor: '#fff3d6' },
  warmText: { color: '#52607a', fontSize: 12, fontWeight: '700' },
  warmTextOn: { color: '#7a5200' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 8 },
  start: { minHeight: 56, borderRadius: 18, backgroundColor: '#007aff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#007aff', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  startText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
