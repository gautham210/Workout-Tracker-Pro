import React, { memo } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import ExerciseVisual from './ExerciseVisual';
import SetRow, { SetField, SetModel } from './SetRow';
import type { PreviousPerformance } from '../lib/workouts';

export type ExerciseModel = { seId: string; exerciseId: string; name: string; muscle: string | null; notes: string; restSeconds: number | null; sets: SetModel[] };

type Props = {
  ex: ExerciseModel; previous?: PreviousPerformance | null; previousLoaded: boolean;
  onChange: (seId: string, setId: string, field: SetField, value: string) => void;
  onToggle: (seId: string, setId: string) => void;
  onWarmup: (seId: string, setId: string) => void;
  onRemoveSet: (seId: string, setId: string) => void;
  onAddSet: (seId: string) => void;
  onRemoveExercise: (seId: string) => void;
  onNotes: (seId: string, text: string) => void;
  onBlur: () => void;
};

const fmt = (n: number | null) => (n == null ? '-' : String(Math.round(n * 100) / 100));

function WorkoutExerciseCard({ ex, previous, previousLoaded, onChange, onToggle, onWarmup, onRemoveSet, onAddSet, onRemoveExercise, onNotes, onBlur }: Props) {
  let working = 0;
  const done = ex.sets.filter((s) => s.completed).length;
  let hint = '';
  if (previous) hint = `Last time on this device: ${previous.sets.slice(0, 6).map((s) => `${fmt(s.weight_kg)}kg × ${s.reps ?? '-'}`).join(', ')}${previous.sets.length > 6 ? '…' : ''}`;
  else if (previousLoaded) hint = 'No previous sets for this exercise saved on this device.';
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <ExerciseVisual name={ex.name} muscle={ex.muscle} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} accessibilityRole="header">{ex.name}</Text>
          <Text style={styles.muscle}>{`${ex.muscle || 'Movement'} · ${done}/${ex.sets.length} sets`}</Text>
        </View>
        <TouchableOpacity onPress={() => onRemoveExercise(ex.seId)} hitSlop={12} style={styles.trash} accessibilityRole="button" accessibilityLabel={`Remove ${ex.name} from workout`}>
          <Trash2 size={19} color="#b4443d" />
        </TouchableOpacity>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.cols}>
        <Text style={[styles.col, { width: 28 }]}>Set</Text>
        <Text style={[styles.col, { flex: 1.3 }]}>kg</Text>
        <Text style={[styles.col, { flex: 1.3 }]}>Reps</Text>
        <Text style={[styles.col, { flex: 0.9 }]}>RPE</Text>
        <Text style={[styles.col, { flex: 0.9 }]}>RIR</Text>
        <Text style={[styles.col, { width: 36 + 20 + 10 }]}>Done</Text>
      </View>
      {ex.sets.map((set) => {
        if (!set.warmup) working++;
        return (
          <SetRow key={set.id} seId={ex.seId} set={set} label={String(working)} onChange={onChange} onToggle={onToggle}
            onWarmup={onWarmup} onRemove={onRemoveSet} onBlur={onBlur} />
        );
      })}
      <TouchableOpacity style={styles.addSet} onPress={() => onAddSet(ex.seId)} accessibilityRole="button" accessibilityLabel={`Add set to ${ex.name}`}>
        <Plus size={16} color="#007aff" /><Text style={styles.addSetText}>Add set</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.notes} value={ex.notes} onChangeText={(t) => onNotes(ex.seId, t)} onBlur={onBlur} placeholder="Notes for this exercise"
        placeholderTextColor="#9aa5b5" multiline maxLength={1000} accessibilityLabel={`Notes for ${ex.name}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#e3eaf3' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: '#172033', fontSize: 18, fontWeight: '800' },
  muscle: { color: '#68758a', fontSize: 13, marginTop: 2 },
  trash: { padding: 6 },
  hint: { color: '#52607a', fontSize: 12, backgroundColor: '#f0f6fd', borderRadius: 10, padding: 8, marginTop: 10 },
  cols: { flexDirection: 'row', gap: 5, paddingHorizontal: 5, marginTop: 12, marginBottom: 6 },
  col: { color: '#7a8799', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 12, backgroundColor: '#eaf4ff', marginTop: 2 },
  addSetText: { color: '#007aff', fontWeight: '800', fontSize: 14 },
  notes: { marginTop: 10, minHeight: 40, maxHeight: 100, backgroundColor: '#f7f8fc', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, color: '#172033', fontSize: 14 },
});

export default memo(WorkoutExerciseCard);
