import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { UploadCloud } from 'lucide-react-native';
import ExerciseVisual from '../components/ExerciseVisual';
import MetricHeader from '../components/MetricHeader';
import MetricSignOut from '../components/MetricSignOut';
import StatusBanner from '../components/StatusBanner';
import SyncPill from '../components/SyncPill';
import { ApiError, BACKEND_URL, isOfflineError, parseWorkoutFromText } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { COLORS } from '../lib/analyticsHooks';
import { CachedExercise, fetchAndCacheCatalog, generateUUID, getDb, getUnsyncedCount } from '../lib/db';
import { useScreenInset } from '../lib/layout';
import { safeStorage } from '../lib/supabase';
import { getLastSyncError, processOutbox, queueCompletedWorkout, SYNC_LABELS } from '../lib/sync';
import { useSyncState } from '../lib/useSyncState';
import { matchExerciseName } from '../lib/workouts';

type ReviewSet = { weight_kg: number; reps: number };
type ReviewItem = { key: number; rawName: string; matched: CachedExercise | null; sets: ReviewSet[]; badSets: number; confidence: number | null; keep: boolean };
type Parsed = { date: string | null; split: string | null; items: ReviewItem[]; ambiguous: string[]; source: string | null };

const HYDRATION_OPTIONS = [{ label: 'Off', value: 0 }, { label: '10 min', value: 10 }, { label: '15 min', value: 15 }, { label: '20 min', value: 20 }];

const importErrorMessage = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.code === 'rate_limited') return 'Too many imports in a short time. Wait a minute and try again.';
    if (e.code === 'network' || e.code === 'timeout') return `${e.message} Nothing was imported.`;
    return e.message;
  }
  if (isOfflineError(e)) return 'You appear to be offline. Nothing was imported.';
  return e instanceof Error ? e.message : 'The workout could not be parsed.';
};

export default function SettingsScreen() {
  const { user } = useAuth();
  const inset = useScreenInset();
  const syncState = useSyncState();

  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const [unsynced, setUnsynced] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [hydration, setHydration] = useState(0);

  const refreshSync = useCallback(async () => {
    if (!user) return;
    try { setUnsynced(await getUnsyncedCount(user.id)); setLastError(await getLastSyncError(user.id)); } catch { setUnsynced(null); }
  }, [user]);
  useEffect(() => { refreshSync(); }, [refreshSync, syncState]);
  useEffect(() => {
    (async () => {
      const type = await safeStorage.getItem('wtp_hydro_type'); const interval = Number(await safeStorage.getItem('wtp_hydro_interval'));
      setHydration(type === 'time' && interval > 0 ? interval : 0);
    })().catch(() => undefined);
  }, []);

  const setHydrationMinutes = async (minutes: number) => {
    setHydration(minutes);
    await safeStorage.setItem('wtp_hydro_type', minutes ? 'time' : 'disabled');
    if (minutes) await safeStorage.setItem('wtp_hydro_interval', String(minutes));
  };

  const retryNow = async () => {
    if (!user || retrying) return;
    setRetrying(true);
    try { await processOutbox(user.id, true); } finally { setRetrying(false); await refreshSync(); }
  };

  const parse = async () => {
    if (!text.trim() || parsing) return;
    setParsing(true); setImportError(null); setParsed(null); setDone(null);
    try {
      const { exercises: catalog } = await fetchAndCacheCatalog();
      if (!catalog.length) throw new Error('The exercise library is not available on this device yet. Connect to the internet once so it can be downloaded, then try again.');
      const result = await parseWorkoutFromText(text, catalog.map((c) => c.name).slice(0, 200));
      const raw: any[] = Array.isArray(result?.exercises) ? result.exercises : [];
      const items: ReviewItem[] = raw.slice(0, 50).map((ex, key) => {
        const rawName = String(ex?.name ?? 'Unnamed exercise').slice(0, 100);
        const matched = matchExerciseName(rawName, catalog) ?? (ex?.matchedName ? matchExerciseName(String(ex.matchedName), catalog) : null);
        const rawSets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
        const sets = rawSets.slice(0, 100).map((s) => ({ weight_kg: Number(s?.weight_kg ?? 0), reps: Math.round(Number(s?.reps)) }))
          .filter((s) => Number.isFinite(s.weight_kg) && s.weight_kg >= 0 && s.weight_kg <= 1000 && Number.isFinite(s.reps) && s.reps >= 1 && s.reps <= 500);
        const full = matched ? catalog.find((c) => c.id === matched.id) ?? null : null;
        return { key, rawName, matched: full, sets, badSets: rawSets.length - sets.length, confidence: typeof ex?.confidence === 'number' ? ex.confidence : null, keep: !!full && sets.length > 0 };
      });
      if (!items.length) throw new Error('No exercises were found in that text. Include exercise names with weights and reps, for example "Bench press 60x8, 60x8".');
      const ambiguous = (Array.isArray(result?.ambiguous) ? result.ambiguous : []).map((a: any) => String(a?.raw ?? '')).filter(Boolean).slice(0, 10);
      setParsed({
        date: /^\d{4}-\d{2}-\d{2}$/.test(result?.date ?? '') ? result.date : null, split: typeof result?.split === 'string' ? result.split.slice(0, 80) : null,
        items, ambiguous, source: typeof result?.source === 'string' ? result.source : null,
      });
    } catch (e) { setImportError(importErrorMessage(e)); } finally { setParsing(false); }
  };

  const toggle = (key: number) => setParsed((p) => (p ? { ...p, items: p.items.map((i) => (i.key === key && i.matched && i.sets.length ? { ...i, keep: !i.keep } : i)) } : p));

  const confirmImport = async () => {
    if (!user || !parsed || saving) return;
    const kept = parsed.items.filter((i) => i.keep && i.matched && i.sets.length);
    if (!kept.length) { setImportError('Keep at least one matched exercise to import.'); return; }
    setSaving(true); setImportError(null);
    try {
      const id = generateUUID();
      const date = parsed.date ? `${parsed.date}T12:00:00.000Z` : new Date().toISOString();
      const splitDay = parsed.split || 'Imported';
      const workout = {
        id, date, split_type: 'imported', split_day: splitDay, notes: null, duration_minutes: null, is_finished: true,
        exercises: kept.map((item, index) => ({
          id: generateUUID(), exercise_id: item.matched!.id, order_index: index, notes: null,
          sets: item.sets.map((s, i) => ({ id: generateUUID(), set_number: i + 1, weight_kg: s.weight_kg, reps: s.reps, completed: true, rpe: null, rir: null, is_warmup: false, notes: null })),
        })),
      };
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        const now = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO workout_sessions (id, user_id, date, split_type, split_day, duration_minutes, is_finished, created_at, updated_at) VALUES (?, ?, ?, 'imported', ?, NULL, 1, ?, ?)`,
          [id, user.id, date, splitDay, now, now]);
        for (const exercise of workout.exercises) {
          await db.runAsync('INSERT INTO session_exercises (id, session_id, exercise_id, order_index) VALUES (?, ?, ?, ?)', [exercise.id, id, exercise.exercise_id, exercise.order_index]);
          for (const set of exercise.sets) {
            await db.runAsync('INSERT INTO sets (id, session_exercise_id, set_number, weight_kg, reps, completed, rpe, rir, is_warmup) VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, 0)',
              [set.id, exercise.id, set.set_number, set.weight_kg, set.reps]);
          }
        }
        await queueCompletedWorkout(user.id, workout);
      });
      processOutbox(user.id).catch(() => undefined);
      const dropped = parsed.items.length - kept.length;
      setDone(`Saved ${kept.length} exercise${kept.length === 1 ? '' : 's'} as a finished workout on this device${dropped ? `; ${dropped} dropped` : ''}. It will sync to your account automatically.`);
      setParsed(null); setText('');
    } catch (e) { setImportError(e instanceof Error ? `Not saved: ${e.message}` : 'Not saved. Please try again.'); } finally { setSaving(false); }
  };

  const keptCount = parsed ? parsed.items.filter((i) => i.keep).length : 0;
  const droppedCount = parsed ? parsed.items.length - keptCount : 0;
  const version = Constants.expoConfig?.version ?? 'unknown';
  let backendHost = 'not configured';
  try { if (BACKEND_URL) backendHost = new URL(BACKEND_URL).host; } catch { backendHost = 'invalid URL'; }
  const syncLabel = syncState === 'idle' ? 'Checking…' : SYNC_LABELS[syncState];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MetricHeader title="Settings & import" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: inset.contentBottom }]}>
          <Text style={styles.section}>Import a workout log</Text>
          <View style={styles.card}>
            <Text style={styles.muted}>Paste a log from Notes or a message. AI reads it, then you review every exercise before anything is saved. Weights are read as kilograms.</Text>
            {!parsed ? (
              <>
                <TextInput accessibilityLabel="Workout log text" style={styles.area} multiline placeholder={'Monday push\nBench press 60x8, 60x8, 62.5x6\nOverhead press 40x10 x3'} placeholderTextColor="#6b778b"
                  value={text} onChangeText={setText} textAlignVertical="top" maxLength={12000} />
                <TouchableOpacity accessibilityRole="button" disabled={!text.trim() || parsing} onPress={parse} style={[styles.primary, (!text.trim() || parsing) && { opacity: 0.5 }]}>
                  {parsing ? <ActivityIndicator color="#fff" /> : <><UploadCloud color="#fff" size={18} /><Text style={styles.primaryText}>Parse and review</Text></>}
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.reviewTitle}>Review before saving</Text>
                <Text style={styles.muted}>
                  Date: {parsed.date ?? 'not found in the text, so it will be saved as today'}{parsed.split ? ` · Split: ${parsed.split}` : ''}. AI parsing can misread names, weights, and reps; check each one.
                </Text>
                {parsed.items.map((item) => {
                  const usable = !!item.matched && item.sets.length > 0;
                  return (
                    <View key={item.key} style={[styles.item, !item.keep && { opacity: 0.55 }]}>
                      <View style={styles.itemHead}>
                        {item.matched ? <ExerciseVisual name={item.matched.name} muscle={item.matched.muscle_group} size={44} radius={12} /> : null}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>{item.matched ? item.matched.name : item.rawName}</Text>
                          <Text style={[styles.status, { color: usable ? COLORS.green : COLORS.red }]}>
                            {!item.matched ? 'No match in the exercise library: will be dropped' : item.sets.length === 0 ? 'No valid sets found: will be dropped' : item.matched.name.toLowerCase() === item.rawName.toLowerCase() ? 'Matched' : `Matched from "${item.rawName}"`}
                            {usable && item.confidence !== null && item.confidence < 0.7 ? ' · low parser confidence, check it' : ''}
                          </Text>
                        </View>
                        <Switch accessibilityLabel={`Keep ${item.matched?.name ?? item.rawName}`} value={item.keep} disabled={!usable} onValueChange={() => toggle(item.key)} />
                      </View>
                      {item.sets.length ? <Text style={styles.sets}>{item.sets.map((s) => `${s.weight_kg} kg × ${s.reps}`).join('   ')}</Text> : null}
                      {item.badSets > 0 ? <Text style={styles.warn}>{item.badSets} set{item.badSets === 1 ? '' : 's'} with unreadable or out-of-range values were ignored.</Text> : null}
                    </View>
                  );
                })}
                {parsed.ambiguous.length ? <Text style={styles.warn}>The parser was unsure about: {parsed.ambiguous.join(', ')}.</Text> : null}
                <Text style={[styles.reviewTitle, { marginTop: 10 }]}>{keptCount} of {parsed.items.length} exercise{parsed.items.length === 1 ? '' : 's'} will be imported{droppedCount ? ` · ${droppedCount} dropped` : ''}</Text>
                <View style={styles.row}>
                  <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => { setParsed(null); setImportError(null); }} style={[styles.ghost, { flex: 1 }]}><Text style={styles.ghostText}>Back</Text></TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" disabled={saving || !keptCount} onPress={confirmImport} style={[styles.primary, { flex: 2, marginTop: 0 }, (saving || !keptCount) && { opacity: 0.5 }]}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save {keptCount} exercise{keptCount === 1 ? '' : 's'}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {importError ? <StatusBanner kind={/offline/i.test(importError) ? 'offline' : 'error'} message={importError} style={{ marginTop: 10 }} /> : null}
            {done ? <StatusBanner kind="success" message={done} style={{ marginTop: 10 }} /> : null}
          </View>

          <Text style={styles.section}>Sync</Text>
          <View style={styles.card}>
            <SyncPill />
            <Text style={styles.line}>Status: {syncLabel}</Text>
            <Text style={styles.line}>Workouts waiting to sync: {unsynced === null ? 'unknown' : unsynced}</Text>
            {lastError ? <Text style={styles.warn}>Last sync error: {lastError}</Text> : null}
            <TouchableOpacity accessibilityRole="button" disabled={retrying} onPress={retryNow} style={[styles.ghost, { marginTop: 10 }, retrying && { opacity: 0.6 }]}>
              {retrying ? <ActivityIndicator color={COLORS.ink} /> : <Text style={styles.ghostText}>Retry now</Text>}
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Workout reminders</Text>
          <View style={styles.card}>
            <Text style={styles.muted}>Show a hydration reminder every few minutes while a workout is open. Reminders only appear on the active workout screen.</Text>
            <View style={styles.chips}>
              {HYDRATION_OPTIONS.map((o) => (
                <TouchableOpacity key={o.value} accessibilityRole="radio" accessibilityState={{ selected: hydration === o.value }} onPress={() => setHydrationMinutes(o.value)} style={[styles.chip, hydration === o.value && styles.chipActive]}>
                  <Text style={[styles.chipText, hydration === o.value && { color: '#fff' }]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.section}>Account and app</Text>
          <View style={styles.card}>
            <Text style={styles.line}>Signed in as {user?.email ?? 'unknown'}</Text>
            <Text style={styles.line}>App version {version}</Text>
            <Text style={styles.line}>Backend: {backendHost}</Text>
            <View style={{ marginTop: 12 }}><MetricSignOut /></View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  section: { color: COLORS.ink, fontSize: 18, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: COLORS.line },
  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  line: { color: COLORS.body, fontSize: 14, lineHeight: 22, marginTop: 4 },
  area: { minHeight: 140, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#c9d2e0', backgroundColor: '#fafbfe', padding: 12, color: COLORS.ink, fontSize: 15 },
  primary: { minHeight: 50, borderRadius: 14, backgroundColor: COLORS.blueText, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  ghost: { minHeight: 50, borderRadius: 14, backgroundColor: '#eef2f8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  ghostText: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  reviewTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  item: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingVertical: 10, marginTop: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  status: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  sets: { color: COLORS.body, fontSize: 13, marginTop: 6 },
  warn: { color: COLORS.amber, fontSize: 12, lineHeight: 17, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: '#c9d2e0', justifyContent: 'center', backgroundColor: '#fff' },
  chipActive: { backgroundColor: COLORS.blueText, borderColor: COLORS.blueText },
  chipText: { color: COLORS.body, fontSize: 13, fontWeight: '700' },
});
