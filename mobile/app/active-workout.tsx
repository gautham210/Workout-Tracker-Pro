import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import { useAuth } from '../lib/AuthContext';
import { CachedExercise, generateUUID, getDb, getLocalSession, LocalSession, upsertLocalExercises } from '../lib/db';
import { processOutbox, queueCompletedWorkout } from '../lib/sync';
import { useScreenInset } from '../lib/layout';
import { createSessionFromPlan, discardSession, findResumableSession, getPreviousPerformance, PreviousPerformance } from '../lib/workouts';
import WorkoutTimer, { DEFAULT_REST_SECONDS, RestTrigger } from '../components/WorkoutTimer';
import WorkoutExerciseCard, { ExerciseModel } from '../components/WorkoutExerciseCard';
import ExerciseLibrarySheet from '../components/ExerciseLibrarySheet';
import { SetField, SetModel, sanitizeSetInput } from '../components/SetRow';
import HydrationAlert from '../components/HydrationAlert';
import StatusBanner from '../components/StatusBanner';
import SyncPill from '../components/SyncPill';

const numText = (v: number | null | undefined) => (v != null ? String(v) : '');
const toSetModel = (s: LocalSession['exercises'][number]['sets'][number]): SetModel => ({
  id: s.id, weight: numText(s.weight_kg), reps: numText(s.reps), rpe: numText(s.rpe), rir: numText(s.rir),
  completed: !!s.completed, warmup: !!s.is_warmup,
});
const toExerciseModel = (e: LocalSession['exercises'][number]): ExerciseModel => ({
  seId: e.id, exerciseId: e.exercise_id, name: e.name, muscle: e.muscle_group, notes: e.notes ?? '', restSeconds: e.rest_seconds, sets: e.sets.map(toSetModel),
});
const blankSet = (warmup = false, weight = '', reps = ''): SetModel => ({ id: generateUUID(), weight, reps, rpe: '', rir: '', completed: false, warmup });
const nullableNum = (v: string) => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ resumeSessionId?: string; exercises?: string }>();
  const { user } = useAuth();
  const inset = useScreenInset();
  const { height } = useWindowDimensions();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseModel[]>([]);
  const [previous, setPrevious] = useState<Record<string, PreviousPerformance>>({});
  const [previousLoaded, setPreviousLoaded] = useState<Set<string>>(new Set());
  const [rest, setRest] = useState<RestTrigger>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const exercisesRef = useRef<ExerciseModel[]>([]);
  const sessionRef = useRef<{ id: string; startTime: number } | null>(null);
  const initRan = useRef(false);
  const restCounter = useRef(0);
  const dirtySets = useRef(new Set<string>());
  const dirtyEx = useRef(new Set<string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const closing = useRef(false);

  const update = useCallback((fn: (cur: ExerciseModel[]) => ExerciseModel[]) => {
    const next = fn(exercisesRef.current);
    if (next === exercisesRef.current) return;
    exercisesRef.current = next;
    setExercises(next);
  }, []);

  // ---- serialized local persistence ----
  const enqueue = useCallback((job: () => Promise<void>) => {
    const run = chain.current.then(job).catch((error) => { console.warn('[workout] local save failed', error); setSaveError(true); });
    chain.current = run;
    return run;
  }, []);

  const doFlush = useCallback(async () => {
    if (closing.current) return;
    const setIds = [...dirtySets.current]; const exIds = [...dirtyEx.current];
    dirtySets.current.clear(); dirtyEx.current.clear();
    if (!setIds.length && !exIds.length) return;
    try {
      const db = await getDb();
      const list = exercisesRef.current;
      await db.withTransactionAsync(async () => {
        for (const seId of exIds) {
          const index = list.findIndex((e) => e.seId === seId);
          if (index < 0) continue;
          await db.runAsync('UPDATE session_exercises SET notes = ?, order_index = ? WHERE id = ?', [list[index].notes.trim() || null, index, seId]);
        }
        for (const setId of setIds) {
          for (const ex of list) {
            const i = ex.sets.findIndex((s) => s.id === setId);
            if (i < 0) continue;
            const s = ex.sets[i];
            await db.runAsync('UPDATE sets SET set_number = ?, weight_kg = ?, reps = ?, rpe = ?, rir = ?, completed = ?, is_warmup = ? WHERE id = ?',
              [i + 1, nullableNum(s.weight), nullableNum(s.reps), nullableNum(s.rpe), nullableNum(s.rir), s.completed ? 1 : 0, s.warmup ? 1 : 0, setId]);
            break;
          }
        }
      });
      setSaveError(false);
    } catch (error) {
      setIds.forEach((i) => dirtySets.current.add(i)); exIds.forEach((i) => dirtyEx.current.add(i));
      throw error;
    }
  }, []);

  const flushNow = useCallback(() => {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    return enqueue(doFlush);
  }, [enqueue, doFlush]);
  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flushTimer.current = null; enqueue(doFlush); }, 400);
  }, [enqueue, doFlush]);

  // ---- initialisation (runs once) ----
  const loadPrevious = useCallback(async (ids: string[], exclude: string) => {
    if (!userId) return;
    try {
      const result = await getPreviousPerformance(userId, ids, exclude);
      setPrevious((cur) => ({ ...cur, ...result }));
    } catch { /* hint is optional */ }
    setPreviousLoaded((cur) => new Set([...cur, ...ids]));
  }, [userId]);

  const loadSession = useCallback(async (id: string) => {
    if (!userId) return false;
    const s = await getLocalSession(userId, id);
    if (!s || s.is_finished) return false;
    const list = s.exercises.map(toExerciseModel);
    exercisesRef.current = list;
    sessionRef.current = { id: s.id, startTime: new Date(s.date).getTime() || Date.now() };
    setExercises(list); setSessionId(s.id);
    loadPrevious(list.map((e) => e.exerciseId), s.id);
    return true;
  }, [userId, loadPrevious]);

  useEffect(() => {
    if (!userId || initRan.current) return;
    initRan.current = true;
    (async () => {
      try {
        let id = typeof params.resumeSessionId === 'string' ? params.resumeSessionId : null;
        if (!id && typeof params.exercises === 'string') {
          // Legacy hand-off: convert once into a durable session.
          const parsed = JSON.parse(params.exercises) as { id: string; name: string; muscle_group?: string }[];
          await upsertLocalExercises(parsed.map((e) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group })));
          id = await createSessionFromPlan(userId, { exercises: parsed.map((e) => ({ exerciseId: e.id, sets: 3 })) });
          router.setParams({ exercises: undefined, resumeSessionId: id });
        }
        if (!id) id = await findResumableSession(userId);
        if (!id || !(await loadSession(id))) setLoadError('This workout could not be found. It may have been finished or discarded.');
      } catch (error) {
        console.warn('[workout] initialization failed', error);
        setLoadError(String((error as { message?: string })?.message ?? 'Could not open this workout.'));
      } finally { setLoading(false); }
    })();
  }, [userId, params.resumeSessionId, params.exercises, loadSession, router]);

  // ---- lifecycle: save on background/unmount ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') flushNow(); });
    return () => { sub.remove(); if (!closing.current) flushNow(); };
  }, [flushNow]);

  // ---- set / exercise editing (stable callbacks) ----
  const onChange = useCallback((seId: string, setId: string, field: SetField, text: string) => {
    const clean = sanitizeSetInput(field, text);
    if (clean === null) return;
    update((cur) => cur.map((e) => (e.seId !== seId ? e : { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, [field]: clean } : s)) })));
    dirtySets.current.add(setId); scheduleFlush();
  }, [update, scheduleFlush]);

  const onToggle = useCallback((seId: string, setId: string) => {
    const ex = exercisesRef.current.find((e) => e.seId === seId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (!ex || !set) return;
    if (!set.completed && !(Number.isInteger(Number(set.reps)) && Number(set.reps) >= 1)) {
      Alert.alert('Add the reps first', 'Enter at least 1 rep before marking a set complete. Leave weight empty for bodyweight.');
      return;
    }
    update((cur) => cur.map((e) => (e.seId !== seId ? e : { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, completed: !s.completed } : s)) })));
    dirtySets.current.add(setId); flushNow();
    if (!set.completed) setRest({ id: ++restCounter.current, seconds: ex.restSeconds ?? DEFAULT_REST_SECONDS, label: ex.name });
  }, [update, flushNow]);

  const onWarmup = useCallback((seId: string, setId: string) => {
    update((cur) => cur.map((e) => (e.seId !== seId ? e : { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, warmup: !s.warmup } : s)) })));
    dirtySets.current.add(setId); flushNow();
  }, [update, flushNow]);

  const onNotes = useCallback((seId: string, text: string) => {
    update((cur) => cur.map((e) => (e.seId === seId ? { ...e, notes: text } : e)));
    dirtyEx.current.add(seId); scheduleFlush();
  }, [update, scheduleFlush]);

  const onAddSet = useCallback((seId: string) => {
    const ex = exercisesRef.current.find((e) => e.seId === seId);
    if (!ex) return;
    const lastWork = [...ex.sets].reverse().find((s) => !s.warmup);
    const set = blankSet(false, lastWork?.weight ?? '', lastWork?.reps ?? '');
    update((cur) => cur.map((e) => (e.seId === seId ? { ...e, sets: [...e.sets, set] } : e)));
    const number = ex.sets.length + 1;
    enqueue(async () => {
      const db = await getDb();
      await db.runAsync('INSERT INTO sets (id, session_exercise_id, set_number, weight_kg, reps, completed, is_warmup) VALUES (?, ?, ?, ?, ?, 0, 0)',
        [set.id, seId, number, nullableNum(set.weight), nullableNum(set.reps)]);
    });
  }, [update, enqueue]);

  const onRemoveSet = useCallback((seId: string, setId: string) => {
    const ex = exercisesRef.current.find((e) => e.seId === seId);
    if (!ex) return;
    if (ex.sets.length <= 1) { Alert.alert('Keep at least one set', 'Remove the whole exercise instead if you are not doing it.'); return; }
    update((cur) => cur.map((e) => (e.seId === seId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e)));
    dirtySets.current.delete(setId);
    ex.sets.filter((s) => s.id !== setId).forEach((s) => dirtySets.current.add(s.id));
    enqueue(async () => { const db = await getDb(); await db.runAsync('DELETE FROM sets WHERE id = ?', [setId]); });
    flushNow();
  }, [update, enqueue, flushNow]);

  const removeExercise = useCallback((seId: string) => {
    update((cur) => cur.filter((e) => e.seId !== seId));
    exercisesRef.current.forEach((e) => dirtyEx.current.add(e.seId));
    enqueue(async () => {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM sets WHERE session_exercise_id = ?', [seId]);
        await db.runAsync('DELETE FROM session_exercises WHERE id = ?', [seId]);
      });
    });
    flushNow();
  }, [update, enqueue, flushNow]);

  const onRemoveExercise = useCallback((seId: string) => {
    const ex = exercisesRef.current.find((e) => e.seId === seId);
    if (!ex) return;
    const done = ex.sets.filter((s) => s.completed).length;
    if (!done) { removeExercise(seId); return; }
    Alert.alert(`Remove ${ex.name}?`, `${done} completed set${done === 1 ? '' : 's'} will be deleted from this workout.`, [
      { text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeExercise(seId) },
    ]);
  }, [removeExercise]);

  const onAddExercise = useCallback((exercise: CachedExercise) => {
    const session = sessionRef.current;
    if (!session || exercisesRef.current.some((e) => e.exerciseId === exercise.id)) return;
    const model: ExerciseModel = {
      seId: generateUUID(), exerciseId: exercise.id, name: exercise.name, muscle: exercise.muscle_group, notes: '', restSeconds: null,
      sets: [blankSet(), blankSet(), blankSet()],
    };
    const order = exercisesRef.current.length;
    update((cur) => [...cur, model]);
    setLibraryOpen(false);
    enqueue(async () => {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO session_exercises (id, session_id, exercise_id, order_index) VALUES (?, ?, ?, ?)', [model.seId, session.id, exercise.id, order]);
        for (const [i, s] of model.sets.entries()) {
          await db.runAsync('INSERT INTO sets (id, session_exercise_id, set_number, completed, is_warmup) VALUES (?, ?, ?, 0, 0)', [s.id, model.seId, i + 1]);
        }
      });
    });
    loadPrevious([exercise.id], session.id);
  }, [update, enqueue, loadPrevious]);

  // ---- leaving: close / back / discard ----
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/workout');
  }, [router]);

  const confirmClose = useCallback(() => {
    if (finishing) return;
    Alert.alert('Leave this workout?', 'Your progress is saved on this device. You can resume it from the Train tab, or discard it.', [
      { text: 'Keep working', style: 'cancel' },
      { text: 'Save and leave', onPress: () => { flushNow().then(leave); } },
      {
        text: 'Discard workout', style: 'destructive', onPress: () => {
          Alert.alert('Discard workout?', 'Everything logged in this workout will be deleted from this device.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: async () => {
              closing.current = true;
              if (flushTimer.current) clearTimeout(flushTimer.current);
              dirtySets.current.clear(); dirtyEx.current.clear();
              await chain.current;
              try { if (userId && sessionRef.current) await discardSession(userId, sessionRef.current.id); } catch (e) { console.warn('[workout] discard failed', e); }
              leave();
            } },
          ]);
        },
      },
    ]);
  }, [finishing, flushNow, leave, userId]);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (libraryOpen) return false; // let the modal handle it
      confirmClose(); return true;
    });
    return () => sub.remove();
  }, [navigation, confirmClose, libraryOpen]);

  // ---- finish ----
  const summary = useMemo(() => {
    let sets = 0; let volume = 0; let incomplete = 0;
    for (const e of exercises) for (const s of e.sets) {
      if (!s.completed) { incomplete++; continue; }
      if (s.warmup) continue;
      sets++; volume += (nullableNum(s.weight) ?? 0) * (nullableNum(s.reps) ?? 0);
    }
    return { sets, volume: Math.round(volume), incomplete };
  }, [exercises]);

  const commitFinish = useCallback(async () => {
    const session = sessionRef.current;
    if (!userId || !session) return;
    setFinishing(true);
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    try {
      await chain.current;
      const list = exercisesRef.current;
      const duration = Math.min(1440, Math.max(1, Math.round((Date.now() - session.startTime) / 60000)));
      const kept = list.map((e) => ({ e, sets: e.sets.filter((s) => s.completed) })).filter((x) => x.sets.length > 0);
      const workout = {
        id: session.id, date: new Date(session.startTime).toISOString(), split_type: 'custom', split_day: 'Custom',
        duration_minutes: duration, is_finished: true,
        exercises: kept.map(({ e, sets }, order) => ({
          id: e.seId, exercise_id: e.exerciseId, order_index: order, notes: e.notes.trim() || null, rest_seconds: e.restSeconds,
          sets: sets.map((s, i) => ({
            id: s.id, set_number: i + 1, weight_kg: nullableNum(s.weight) ?? 0, reps: Number(s.reps), completed: true,
            rpe: nullableNum(s.rpe), rir: nullableNum(s.rir), is_warmup: s.warmup, notes: null,
          })),
        })),
      };
      closing.current = true; // stop lifecycle/debounced writes touching rows we are rewriting
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        for (const e of list) {
          const entry = kept.find((k) => k.e.seId === e.seId);
          if (!entry) {
            await db.runAsync('DELETE FROM sets WHERE session_exercise_id = ?', [e.seId]);
            await db.runAsync('DELETE FROM session_exercises WHERE id = ?', [e.seId]);
            continue;
          }
          const keepIds = new Set(entry.sets.map((s) => s.id));
          for (const s of e.sets) if (!keepIds.has(s.id)) await db.runAsync('DELETE FROM sets WHERE id = ?', [s.id]);
          for (const [i, s] of entry.sets.entries()) {
            await db.runAsync('UPDATE sets SET set_number = ?, weight_kg = ?, reps = ?, rpe = ?, rir = ?, completed = 1, is_warmup = ? WHERE id = ?',
              [i + 1, nullableNum(s.weight) ?? 0, Number(s.reps), nullableNum(s.rpe), nullableNum(s.rir), s.warmup ? 1 : 0, s.id]);
          }
          await db.runAsync('UPDATE session_exercises SET order_index = ?, notes = ? WHERE id = ?', [kept.indexOf(entry), e.notes.trim() || null, e.seId]);
        }
        await db.runAsync('UPDATE workout_sessions SET is_finished = 1, duration_minutes = ?, updated_at = ? WHERE id = ? AND user_id = ?',
          [duration, new Date().toISOString(), session.id, userId]);
        await queueCompletedWorkout(userId, workout);
      });
      processOutbox(userId).catch(() => undefined);
      Alert.alert('Saved on this device', 'Your workout is stored locally. Its sync status is shown in History and will update once the server confirms it.');
      router.replace('/(tabs)/history');
    } catch (error) {
      closing.current = false;
      setFinishing(false);
      Alert.alert('Could not save workout', `${String((error as { message?: string })?.message ?? error)}\n\nNothing was lost. Your sets are still on screen.`);
    }
  }, [userId, router]);

  const onFinish = useCallback(() => {
    if (finishing) return;
    const list = exercisesRef.current;
    const workingDone = list.some((e) => e.sets.some((s) => s.completed && !s.warmup));
    if (!workingDone) {
      Alert.alert('No completed working sets', 'Mark at least one working set (not a warm-up) as complete before finishing.');
      return;
    }
    const incomplete = list.reduce((n, e) => n + e.sets.filter((s) => !s.completed).length, 0);
    if (incomplete > 0) {
      Alert.alert('Some sets are not complete', `${incomplete} set${incomplete === 1 ? ' is' : 's are'} not marked complete. Finishing will drop ${incomplete === 1 ? 'it' : 'them'} from the saved workout.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Finish and drop incomplete', style: 'destructive', onPress: () => { commitFinish(); } },
      ]);
      return;
    }
    commitFinish();
  }, [finishing, commitFinish]);

  // ---- render ----
  if (loading) {
    return <View style={[styles.root, styles.center, { paddingTop: inset.top }]}><ActivityIndicator color="#0ea5e9" /></View>;
  }
  if (loadError || !sessionId) {
    return (
      <View style={[styles.root, { paddingTop: inset.top + 16, paddingHorizontal: 16 }]}>
        <StatusBanner kind="error" title="Cannot open workout" message={loadError ?? 'No workout to show.'} actionLabel="Back" onAction={leave} />
      </View>
    );
  }

  const existingIds = exercises.map((e) => e.exerciseId);
  return (
    <View style={[styles.root, { paddingTop: inset.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={confirmClose} hitSlop={12} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close workout">
          <X color="#24324a" size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title} accessibilityRole="header">Active workout</Text>
          <Text style={styles.sub}>{`${summary.sets} working set${summary.sets === 1 ? '' : 's'} · ${summary.volume} kg volume`}</Text>
        </View>
        <TouchableOpacity onPress={onFinish} disabled={finishing} hitSlop={8} style={[styles.finishBtn, finishing && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Finish workout">
          <Text style={styles.finishText}>{finishing ? 'Saving…' : 'Finish'}</Text>
        </TouchableOpacity>
      </View>
      <SyncPill style={{ alignSelf: 'center', marginTop: 6 }} />
      {saveError ? <StatusBanner kind="error" style={{ margin: 12, marginBottom: 0 }} title="Could not save to this device" message="Your latest edit may not be stored yet. Keep this screen open and try editing again." /> : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 12, paddingBottom: inset.contentBottom + Math.min(80, height * 0.1) }}
        >
          {exercises.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No exercises in this workout</Text>
              <Text style={styles.emptyCopy}>Add an exercise to start logging sets.</Text>
            </View>
          ) : null}
          {exercises.map((ex) => (
            <WorkoutExerciseCard
              key={ex.seId} ex={ex} previous={previous[ex.exerciseId]} previousLoaded={previousLoaded.has(ex.exerciseId)}
              onChange={onChange} onToggle={onToggle} onWarmup={onWarmup} onRemoveSet={onRemoveSet} onAddSet={onAddSet}
              onRemoveExercise={onRemoveExercise} onNotes={onNotes} onBlur={flushNow}
            />
          ))}
          <TouchableOpacity style={styles.addEx} onPress={() => setLibraryOpen(true)} accessibilityRole="button" accessibilityLabel="Add exercise">
            <Plus size={18} color="#007aff" /><Text style={styles.addExText}>Add exercise</Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={{ paddingBottom: Math.max(inset.bottom, 8) }}>
          <WorkoutTimer trigger={rest} />
        </View>
      </KeyboardAvoidingView>

      <HydrationAlert completedSetsCount={summary.sets} />
      <ExerciseLibrarySheet visible={libraryOpen} selectedIds={existingIds} onAdd={onAddExercise} onClose={() => setLibraryOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fc' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(28,48,82,0.08)' },
  iconBtn: { padding: 8 },
  title: { color: '#172033', fontSize: 17, fontWeight: '700' },
  sub: { color: '#68758a', fontSize: 12, marginTop: 1 },
  finishBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#007aff', justifyContent: 'center' },
  finishText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  empty: { alignItems: 'center', padding: 28 },
  emptyTitle: { color: '#172033', fontSize: 17, fontWeight: '800' },
  emptyCopy: { color: '#68758a', fontSize: 13, marginTop: 6 },
  addEx: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9cc6ee', backgroundColor: '#f1f8ff' },
  addExText: { color: '#007aff', fontWeight: '800', fontSize: 15 },
});
