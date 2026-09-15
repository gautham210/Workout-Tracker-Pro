import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../../components/GlassCard';
import { Plus, Play, Trash2 } from 'lucide-react-native';

const PRESET_EXERCISES = [
  { id: '1', name: 'Barbell Bench Press', muscle_group: 'Chest' },
  { id: '2', name: 'Incline Dumbbell Press', muscle_group: 'Chest' },
  { id: '3', name: 'Lat Pulldown', muscle_group: 'Back' },
  { id: '4', name: 'Barbell Squat', muscle_group: 'Legs' },
];

export default function WorkoutBuilderScreen() {
  const router = useRouter();
  const [selectedExercises, setSelectedExercises] = useState(PRESET_EXERCISES.slice(0, 2));

  const startSession = () => {
    // In a real app we'd pass the payload via global store or route params
    // We'll navigate to the active session modal
    router.push('/active-workout');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.headerTitle}>Workout Builder</Text>
        
        <ScrollView style={styles.list}>
          {selectedExercises.map((ex, index) => (
            <GlassCard key={ex.id + index.toString()} style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <View>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedExercises(prev => prev.filter((_, i) => i !== index))}>
                  <Trash2 color="rgba(255,255,255,0.4)" size={20} />
                </TouchableOpacity>
              </View>
            </GlassCard>
          ))}

          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setSelectedExercises(prev => [...prev, PRESET_EXERCISES[2]])}
          >
            <Plus color="#0ea5e9" size={24} />
            <Text style={styles.addText}>Add Exercise</Text>
          </TouchableOpacity>
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
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    marginTop: 20,
  },
  list: {
    flex: 1,
  },
  exerciseCard: {
    marginBottom: 12,
    padding: 16,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  muscleGroup: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    borderRadius: 16,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addText: {
    color: '#0ea5e9',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  footer: {
    paddingVertical: 16,
  },
  startButton: {
    backgroundColor: '#0ea5e9',
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
