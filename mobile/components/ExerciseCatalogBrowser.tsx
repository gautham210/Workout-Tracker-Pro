import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Plus, Search } from 'lucide-react-native';
import { CachedExercise, fetchAndCacheCatalog, initDb } from '../lib/db';
import { normalizeExerciseName } from '../../shared/exerciseCatalog.js';
import ExerciseVisual from './ExerciseVisual';
import ExerciseDetailSheet from './ExerciseDetailSheet';
import StatusBanner from './StatusBanner';

type Props = {
  selectedIds: string[];
  onAdd: (exercise: CachedExercise) => void;
  header?: React.ReactElement | null;
  contentBottom: number;
  addLabel?: string;
};

type Row = { exercise: CachedExercise; search: string };

const ExerciseRow = memo(function ExerciseRow({ item, added, onOpen, onAdd }: {
  item: CachedExercise; added: boolean; onOpen: (e: CachedExercise) => void; onAdd: (e: CachedExercise) => void;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.muscle_group ?? 'exercise'}. Show details`}>
        <ExerciseVisual name={item.name} muscle={item.muscle_group} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.muscle}>{item.muscle_group || 'Movement'}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.addBtn, added && styles.addBtnDone]} disabled={added} onPress={() => onAdd(item)} hitSlop={8}
        accessibilityRole="button" accessibilityLabel={added ? `${item.name} already added` : `Add ${item.name}`}
      >
        {added ? <Check color="#129357" size={20} /> : <Plus color="#007aff" size={22} />}
      </TouchableOpacity>
    </View>
  );
});

const Skeleton = () => (
  <View accessibilityLabel="Loading exercises">
    {[0, 1, 2, 3, 4].map((i) => (
      <View key={i} style={styles.row}>
        <View style={[styles.skel, { width: 52, height: 52, borderRadius: 16 }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skel, { width: '60%', height: 14 }]} />
          <View style={[styles.skel, { width: '30%', height: 10 }]} />
        </View>
      </View>
    ))}
  </View>
);

/** Full-catalog exercise library: debounced search, muscle filters, detail sheet, offline-aware. */
export default function ExerciseCatalogBrowser({ selectedIds, onAdd, header, contentBottom, addLabel }: Props) {
  const [catalog, setCatalog] = useState<CachedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleNote, setStaleNote] = useState(false);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [detail, setDetail] = useState<CachedExercise | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      await initDb();
      const result = await fetchAndCacheCatalog();
      setCatalog(result.exercises);
      setStaleNote(result.source === 'cache');
    } catch (e) {
      setError(String((e as { message?: string })?.message ?? 'Could not load exercises.'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(normalizeExerciseName(text)), 250);
    return () => clearTimeout(t);
  }, [text]);

  const rows = useMemo<Row[]>(() => catalog.map((exercise) => ({
    exercise, search: normalizeExerciseName(`${exercise.name} ${exercise.muscle_group ?? ''} ${exercise.primary_muscles.join(' ')}`),
  })), [catalog]);
  const muscles = useMemo(() => [...new Set(catalog.map((e) => e.muscle_group).filter((m): m is string => !!m))].sort(), [catalog]);
  const filtered = useMemo(() => rows
    .filter((r) => (!muscle || r.exercise.muscle_group === muscle) && (!query || r.search.includes(query)))
    .map((r) => r.exercise), [rows, muscle, query]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleAdd = useCallback((e: CachedExercise) => { onAdd(e); setDetail(null); }, [onAdd]);
  const closeDetail = useCallback(() => setDetail(null), []);
  const renderItem = useCallback(({ item }: { item: CachedExercise }) => (
    <ExerciseRow item={item} added={selected.has(item.id)} onOpen={setDetail} onAdd={onAdd} />
  ), [selected, onAdd]);

  const controls = (
    <View>
      {header}
      <Text style={styles.label}>EXERCISE LIBRARY</Text>
      {staleNote && catalog.length ? (
        <StatusBanner kind="offline" style={{ marginBottom: 10 }} title="Showing saved exercises"
          message={`Could not refresh the library, so these ${catalog.length} exercises come from this device.`} actionLabel="Retry" onAction={load} />
      ) : null}
      <View style={styles.searchBox}>
        <Search color="#7b8799" size={18} />
        <TextInput
          style={styles.searchInput} value={text} onChangeText={setText} placeholder="Search exercises" placeholderTextColor="#9aa5b5"
          autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing"
          accessibilityLabel="Search exercises"
        />
      </View>
      {muscles.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.chips} contentContainerStyle={{ gap: 8 }}>
          {[null, ...muscles].map((m) => {
            const on = m === muscle;
            return (
              <TouchableOpacity key={m ?? 'all'} onPress={() => setMuscle(m)} style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Filter ${m ?? 'all muscle groups'}`}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{m ?? 'All'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  let empty: React.ReactElement | null = null;
  if (loading) empty = <Skeleton />;
  else if (error && !catalog.length) {
    empty = <StatusBanner kind="error" title="Could not load exercises" message={error} actionLabel="Retry" onAction={load} />;
  } else if (!catalog.length) {
    empty = <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No exercises on this device yet</Text>
      <Text style={styles.emptyCopy}>Connect to the internet once to download the exercise library.</Text>
      <TouchableOpacity onPress={load} style={styles.retry} accessibilityRole="button"><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View>;
  } else if (!filtered.length) {
    empty = <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No matches</Text>
      <Text style={styles.emptyCopy}>Try a different search or muscle group.</Text></View>;
  }

  return (
    <>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        extraData={selected}
        ListHeaderComponent={controls}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: contentBottom }}
      />
      <ExerciseDetailSheet exercise={detail} added={detail ? selected.has(detail.id) : false} addLabel={addLabel} onAdd={handleAdd} onClose={closeDetail} />
      {loading ? <ActivityIndicator style={styles.spinner} color="#0ea5e9" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: '#78869a', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9, marginTop: 6 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dfe6f0', paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, color: '#172033', fontSize: 15, paddingVertical: 10 },
  chips: { marginTop: 10, marginBottom: 6, flexGrow: 0 },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfe6f0', justifyContent: 'center' },
  chipOn: { backgroundColor: '#007aff', borderColor: '#007aff' },
  chipText: { color: '#35445c', fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 68, borderBottomWidth: 1, borderBottomColor: '#e7edf4', paddingVertical: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: '#172033', fontSize: 15, fontWeight: '700' },
  muscle: { color: '#718096', fontSize: 12, marginTop: 3 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eaf4ff' },
  addBtnDone: { backgroundColor: '#e8f7ee' },
  skel: { backgroundColor: '#e7edf4', borderRadius: 7 },
  emptyBox: { alignItems: 'center', padding: 28 },
  emptyTitle: { color: '#172033', fontSize: 17, fontWeight: '800' },
  emptyCopy: { color: '#68758a', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  retry: { marginTop: 12, paddingHorizontal: 18, minHeight: 40, justifyContent: 'center' },
  retryText: { color: '#007aff', fontWeight: '800', fontSize: 14 },
  spinner: { position: 'absolute', top: 12, right: 20 },
});
