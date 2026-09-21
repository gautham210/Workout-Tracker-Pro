import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../../components/GlassCard';
import { Check, Plus, Play, Trash2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export default function WorkoutBuilderScreen() {
  const router = useRouter();
  const [availableExercises, setAvailableExercises] = useState<any[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    const { data } = await supabase.from('exercises').select('id, name, muscle_group').limit(20);
    if (data) {
      setAvailableExercises(data);
    }
    setLoading(false);
  };

  const startSession = () => {
    // Pass selected exercises via router params as JSON string
    router.push({
      pathname: '/active-workout',
      params: { exercises: JSON.stringify(selectedExercises) }
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator color="#0ea5e9" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.overline}>CREATE A SESSION</Text>
        <Text style={styles.headerTitle}>Train with{`\n`}a clear focus.</Text>
        <Text style={styles.headerCopy}>Choose movements from your real exercise library, then work through one set at a time.</Text>
        
        <ScrollView style={styles.list}>
          {selectedExercises.length === 0 ? <View style={styles.emptyBuilder}><Text style={styles.emptyTitle}>Start with a movement.</Text><Text style={styles.emptyCopy}>Your finished sets will be saved locally first and synced through your workout graph.</Text></View> : selectedExercises.map((ex, index) => (
            <GlassCard key={ex.id + index.toString()} style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <View>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedExercises(prev => prev.filter((_, i) => i !== index))}>
                  <Trash2 color="#7a8799" size={20} />
                </TouchableOpacity>
              </View>
            </GlassCard>
          ))}

          <View style={styles.librarySection}>
            <Text style={styles.libraryLabel}>EXERCISE LIBRARY</Text>
            {availableExercises.map((ex) => {
              const selected = selectedExercises.some((item) => item.id === ex.id);
              return <TouchableOpacity key={ex.id} style={[styles.libraryItem, selected && styles.libraryItemSelected]} disabled={selected} onPress={() => setSelectedExercises((current) => [...current, ex])}>
                <View style={styles.exerciseGlyph}><Text>{(ex.name || 'M').slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.libraryName}>{ex.name}</Text><Text style={styles.libraryMuscle}>{ex.muscle_group || 'Movement'}</Text></View>
                {selected ? <Check color="#129357" size={19} /> : <Plus color="#007aff" size={20} />}
              </TouchableOpacity>;
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.startButton, selectedExercises.length === 0 && styles.disabled]}
            onPress={startSession}
            disabled={selectedExercises.length === 0}
          >
            <Play color="#fff" size={24} fill="#fff" />
            <Text style={styles.startText}>Start Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f8fc' },
  container: { flex: 1, padding: 16 },
  overline: { color: '#7b8799', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginTop: 20 },
  headerTitle: {
    color: '#172033',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.3,
    lineHeight: 34,
    marginTop: 7,
  },
  headerCopy: {
    color: '#68758a', fontSize: 13, lineHeight: 19, maxWidth: 300, marginTop: 12, marginBottom: 20,
  },
  list: {
    flex: 1,
  },
  exerciseCard: {
    marginBottom: 9,
    padding: 13,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '700',
  },
  muscleGroup: {
    color: '#748198',
    fontSize: 14,
    marginTop: 4,
  },
  emptyBuilder: { alignItems: 'center', padding: 28, marginBottom: 17, borderWidth: 1, borderRadius: 23, borderColor: '#c9d6e6', borderStyle: 'dashed' },
  emptyTitle: { color: '#172033', fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
  emptyCopy: { color: '#68758a', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7, maxWidth: 260 },
  librarySection: { marginTop: 13, paddingBottom: 22 },
  libraryLabel: { color: '#78869a', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 9 },
  libraryItem: { minHeight: 67, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e7edf4', flexDirection: 'row', alignItems: 'center', gap: 11 },
  libraryItemSelected: { opacity: 0.62 },
  exerciseGlyph: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#e9f4ff', alignItems: 'center', justifyContent: 'center' },
  libraryName: { color: '#172033', fontSize: 14, fontWeight: '700' },
  libraryMuscle: { color: '#718096', fontSize: 11, marginTop: 3 },
  footer: {
    paddingVertical: 16,
  },
  startButton: {
    backgroundColor: '#007aff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  startText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
  },
});
