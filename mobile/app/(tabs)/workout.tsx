import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../../components/GlassCard';
import { Plus, Play, Trash2 } from 'lucide-react-native';
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
      // pre-select first 2 for convenience if available
      setSelectedExercises(data.slice(0, 2));
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
                  <Trash2 color="#7a8799" size={20} />
                </TouchableOpacity>
              </View>
            </GlassCard>
          ))}

          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => {
              // Just a simple rotation of available exercises for demo
              const nextEx = availableExercises[selectedExercises.length % availableExercises.length];
              if (nextEx) setSelectedExercises(prev => [...prev, nextEx]);
            }}
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
  safeArea: { flex: 1, backgroundColor: '#f7f8fc' },
  container: {
    flex: 1,
    padding: 16,
  },
  headerTitle: {
    color: '#172033',
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
    color: '#172033',
    fontSize: 18,
    fontWeight: '600',
  },
  muscleGroup: {
    color: '#748198',
    fontSize: 14,
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.32)',
    borderRadius: 16,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addText: {
    color: '#007aff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
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
