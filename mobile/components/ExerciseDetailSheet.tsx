import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { resolveExercise } from '../../shared/exerciseCatalog.js';
import type { CachedExercise } from '../lib/db';
import ExerciseVisual from './ExerciseVisual';

type Props = { exercise: CachedExercise | null; added?: boolean; addLabel?: string; onAdd?: (exercise: CachedExercise) => void; onClose: () => void };

const Section = ({ title, items }: { title: string; items: string[] }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {items.length ? items.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>{`•  ${item}`}</Text>)
      : <Text style={styles.none}>Not available for this exercise yet.</Text>}
  </View>
);

export default function ExerciseDetailSheet({ exercise, added, addLabel = 'Add to workout', onAdd, onClose }: Props) {
  const info = useMemo(() => (exercise ? resolveExercise({ ...exercise }) : null), [exercise]);
  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close exercise details" />
      {exercise && info ? (
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <ExerciseVisual name={exercise.name} muscle={exercise.muscle_group} size={72} radius={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} accessibilityRole="header">{exercise.name}</Text>
              <Text style={styles.sub}>{[exercise.muscle_group, info.difficulty].filter(Boolean).join(' · ')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <X color="#24324a" size={22} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            <Section title="EQUIPMENT" items={info.equipment} />
            <Section title="PRIMARY MUSCLES" items={info.primary_muscles} />
            <Section title="FORM CUES" items={info.form_cues} />
            <Section title="COMMON MISTAKES" items={info.common_mistakes} />
          </ScrollView>
          {onAdd ? (
            <TouchableOpacity
              style={[styles.addBtn, added && styles.addBtnDone]} disabled={added}
              onPress={() => onAdd(exercise)} accessibilityRole="button" accessibilityLabel={added ? 'Already added' : addLabel}
            >
              <Text style={styles.addText}>{added ? 'Already added' : addLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 30, maxHeight: '82%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  title: { color: '#172033', fontSize: 20, fontWeight: '800' },
  sub: { color: '#68758a', fontSize: 13, marginTop: 3 },
  close: { padding: 6 },
  section: { marginTop: 16 },
  sectionTitle: { color: '#78869a', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  bullet: { color: '#24324a', fontSize: 14, lineHeight: 21 },
  none: { color: '#8a96a8', fontSize: 13, fontStyle: 'italic' },
  addBtn: { backgroundColor: '#007aff', borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  addBtnDone: { backgroundColor: '#9db9d9' },
  addText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
