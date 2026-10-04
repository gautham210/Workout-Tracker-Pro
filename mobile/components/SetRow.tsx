import React, { memo, useCallback } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, X } from 'lucide-react-native';

export type SetModel = { id: string; weight: string; reps: string; rpe: string; rir: string; completed: boolean; warmup: boolean };
export type SetField = 'weight' | 'reps' | 'rpe' | 'rir';

/** Returns the sanitized value, or null when the typed text is invalid (the change is rejected). */
export function sanitizeSetInput(field: SetField, raw: string): string | null {
  const value = raw.replace(',', '.');
  if (value === '') return '';
  const pattern = field === 'weight' ? /^(\d{1,4}([.]\d{0,2})?|[.]\d{1,2})$/ : field === 'reps' ? /^\d{1,3}$/ : field === 'rpe' ? /^(10|[1-9])$/ : /^(10|[0-9])$/;
  if (!pattern.test(value)) return null;
  if (field === 'weight' && Number(value) > 1000) return null;
  return value;
}

type Props = {
  seId: string; set: SetModel; label: string;
  onChange: (seId: string, setId: string, field: SetField, value: string) => void;
  onToggle: (seId: string, setId: string) => void;
  onWarmup: (seId: string, setId: string) => void;
  onRemove: (seId: string, setId: string) => void;
  onBlur: () => void;
};

function SetRow({ seId, set, label, onChange, onToggle, onWarmup, onRemove, onBlur }: Props) {
  const change = useCallback((field: SetField) => (text: string) => onChange(seId, set.id, field, text), [onChange, seId, set.id]);
  const input = (field: SetField, value: string, placeholder: string, a11y: string, keyboard: 'decimal-pad' | 'number-pad', slim?: boolean) => (
    <TextInput
      style={[styles.input, slim && styles.slim]} value={value} onChangeText={change(field)} onBlur={onBlur}
      placeholder={placeholder} placeholderTextColor="#9aa5b5" keyboardType={keyboard} maxLength={field === 'weight' ? 7 : 3}
      selectTextOnFocus accessibilityLabel={`${a11y}, ${set.warmup ? 'warm-up set' : `set ${label}`}`} editable
    />
  );
  return (
    <View style={[styles.row, set.completed && styles.rowDone, set.warmup && styles.rowWarm]}>
      <TouchableOpacity onPress={() => onWarmup(seId, set.id)} hitSlop={6} style={styles.num} accessibilityRole="button"
        accessibilityLabel={set.warmup ? 'Warm-up set. Tap to make it a working set' : `Set ${label}. Tap to mark as warm-up`}>
        <Text style={[styles.numText, set.warmup && styles.warmText]}>{set.warmup ? 'W' : label}</Text>
      </TouchableOpacity>
      {input('weight', set.weight, 'kg', 'Weight in kilograms', 'decimal-pad')}
      {input('reps', set.reps, 'reps', 'Reps', 'number-pad')}
      {input('rpe', set.rpe, 'RPE', 'RPE 1 to 10', 'number-pad', true)}
      {input('rir', set.rir, 'RIR', 'Reps in reserve 0 to 10', 'number-pad', true)}
      <TouchableOpacity style={[styles.check, set.completed && styles.checkOn]} onPress={() => onToggle(seId, set.id)} hitSlop={4}
        accessibilityRole="checkbox" accessibilityState={{ checked: set.completed }} accessibilityLabel={`Mark ${set.warmup ? 'warm-up set' : `set ${label}`} complete`}>
        {set.completed ? <Check color="#fff" size={18} /> : null}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onRemove(seId, set.id)} hitSlop={10} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove ${set.warmup ? 'warm-up set' : `set ${label}`}`}>
        <X color="#9aa5b5" size={16} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f0f3f8', padding: 5, borderRadius: 12, marginBottom: 6 },
  rowDone: { backgroundColor: 'rgba(16,185,129,0.14)' },
  rowWarm: { backgroundColor: '#fff6df' },
  num: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#24324a', fontSize: 14, fontWeight: '800' },
  warmText: { color: '#a56a00' },
  input: { flex: 1.3, minWidth: 0, height: 40, backgroundColor: '#fff', borderRadius: 9, textAlign: 'center', color: '#172033', fontSize: 15, padding: 0 },
  slim: { flex: 0.9, fontSize: 13 },
  check: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#dfe6f0', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#10b981' },
  remove: { width: 20, alignItems: 'center', justifyContent: 'center', height: 36 },
});

export default memo(SetRow);
