import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView, TouchableOpacity, SafeAreaView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../components/GlassCard';
import WorkoutTimer from '../components/WorkoutTimer';
import HydrationAlert from '../components/HydrationAlert';
import { Check, ArrowLeft, X } from 'lucide-react-native';

const { width } = Dimensions.get('window');

// Mock initial data
const MOCK_EXERCISES = [
  {
    exercise: { id: '1', name: 'Barbell Bench Press', muscle_group: 'Chest' },
    sets: [
      { weight_kg: '60', reps: '10', completed: false, suggestedWeight: '62.5', suggestedReps: '8' },
      { weight_kg: '60', reps: '10', completed: false },
      { weight_kg: '60', reps: '10', completed: false },
    ]
  },
  {
    exercise: { id: '2', name: 'Incline Dumbbell Press', muscle_group: 'Chest' },
    sets: [
      { weight_kg: '25', reps: '12', completed: false },
      { weight_kg: '25', reps: '12', completed: false },
    ]
  }
];

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const [exercises, setExercises] = useState(MOCK_EXERCISES);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Timers and Alerts state
  const [timerTrigger, setTimerTrigger] = useState(0);
  const [activeExerciseName, setActiveExerciseName] = useState(MOCK_EXERCISES[0].exercise.name);
  const [completedSetsCount, setCompletedSetsCount] = useState(0);

  const toggleSet = (exIndex: number, setIndex: number) => {
    const updated = [...exercises];
    const targetSet = updated[exIndex].sets[setIndex];
    
    targetSet.completed = !targetSet.completed;
    
    if (targetSet.completed) {
      setTimerTrigger(prev => prev + 1);
      setActiveExerciseName(updated[exIndex].exercise.name);
      setCompletedSetsCount(prev => prev + 1);
    }
    
    setExercises(updated);
  };

  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    if (currentIndex !== roundIndex) {
      setCurrentIndex(roundIndex);
    }
  };

  const finishWorkout = () => {
    // In real app, save to Supabase here
    router.replace('/(tabs)/history');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <X color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Session</Text>
        <TouchableOpacity onPress={finishWorkout}>
          <Text style={styles.finishText}>Finish</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        horizontal 
        pagingEnabled 
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.carousel}
      >
        {exercises.map((ex, exIndex) => (
          <View key={exIndex} style={styles.page}>
            <GlassCard strong style={styles.card}>
              <Text style={styles.exerciseName}>{ex.exercise.name}</Text>
              <Text style={styles.muscleGroup}>{ex.exercise.muscle_group}</Text>
              
              <View style={styles.setsHeader}>
                <Text style={styles.colHeader}>Set</Text>
                <Text style={styles.colHeader}>kg</Text>
                <Text style={styles.colHeader}>Reps</Text>
                <Text style={styles.colHeader}>Done</Text>
              </View>

              {ex.sets.map((set, setIndex) => (
                <View key={setIndex} style={[styles.setRow, set.completed && styles.setCompletedRow]}>
                  <Text style={styles.setText}>{setIndex + 1}</Text>
                  
                  <TextInput 
                    style={styles.input}
                    placeholder={set.suggestedWeight || '0'}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="numeric"
                    value={set.weight_kg}
                    onChangeText={(val) => {
                      const updated = [...exercises];
                      updated[exIndex].sets[setIndex].weight_kg = val;
                      setExercises(updated);
                    }}
                  />
                  
                  <TextInput 
                    style={styles.input}
                    placeholder={set.suggestedReps || '0'}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="numeric"
                    value={set.reps}
                    onChangeText={(val) => {
                      const updated = [...exercises];
                      updated[exIndex].sets[setIndex].reps = val;
                      setExercises(updated);
                    }}
                  />
                  
                  <TouchableOpacity 
                    style={[styles.checkBtn, set.completed && styles.checkBtnActive]}
                    onPress={() => toggleSet(exIndex, setIndex)}
                  >
                    {set.completed && <Check color="#fff" size={16} />}
                  </TouchableOpacity>
                </View>
              ))}
              
              {ex.sets[0]?.suggestedWeight && (
                <View style={styles.suggestionBox}>
                  <Text style={styles.suggestionText}>
                    💡 AI Suggests: {ex.sets[0].suggestedWeight}kg × {ex.sets[0].suggestedReps}
                  </Text>
                </View>
              )}
            </GlassCard>
          </View>
        ))}
      </ScrollView>
      
      {/* Absolute Overlays */}
      <View style={styles.overlays}>
        <WorkoutTimer triggerCount={timerTrigger} activeExerciseName={activeExerciseName} />
      </View>
      <HydrationAlert completedSetsCount={completedSetsCount} />
      
      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {exercises.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.activeDot]} />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)'
  },
  closeBtn: { padding: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  finishText: { color: '#0ea5e9', fontSize: 16, fontWeight: '700', padding: 8 },
  carousel: { flex: 1 },
  page: {
    width,
    padding: 16,
    justifyContent: 'center',
  },
  card: { padding: 24 },
  exerciseName: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  muscleGroup: { color: 'rgba(255,255,255,0.5)', fontSize: 16, marginBottom: 24 },
  setsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  colHeader: { color: 'rgba(255,255,255,0.5)', fontSize: 14, width: 50, textAlign: 'center' },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 8,
    borderRadius: 12,
    marginBottom: 8,
  },
  setCompletedRow: { backgroundColor: 'rgba(14, 165, 233, 0.15)' },
  setText: { color: '#fff', fontSize: 16, width: 50, textAlign: 'center' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    width: 60,
    height: 40,
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
  },
  checkBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkBtnActive: { backgroundColor: '#10b981' },
  suggestionBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9'
  },
  suggestionText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  overlays: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 },
  activeDot: { backgroundColor: '#0ea5e9', width: 12, height: 12, borderRadius: 6 },
});
