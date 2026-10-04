import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import type { CachedExercise } from '../lib/db';
import ExerciseCatalogBrowser from './ExerciseCatalogBrowser';

type Props = { visible: boolean; selectedIds: string[]; onAdd: (exercise: CachedExercise) => void; onClose: () => void; title?: string };

/** Full-screen modal exercise picker (used to add an exercise mid-workout). */
export default function ExerciseLibrarySheet({ visible, selectedIds, onAdd, onClose, title = 'Add exercise' }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Close exercise library">
              <X color="#24324a" size={24} />
            </TouchableOpacity>
          </View>
          {visible ? <ExerciseCatalogBrowser selectedIds={selectedIds} onAdd={onAdd} contentBottom={32} addLabel="Add to this workout" /> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f8fc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { color: '#172033', fontSize: 22, fontWeight: '800' },
  close: { padding: 6 },
});
