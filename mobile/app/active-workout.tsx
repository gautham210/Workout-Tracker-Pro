import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import GlassCard from '../components/GlassCard';
import WorkoutTimer from '../components/WorkoutTimer';
import HydrationAlert from '../components/HydrationAlert';
import { Check, ArrowLeft, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { getDb, generateUUID, upsertLocalExercises } from '../lib/db';
import { queueCompletedWorkout, processOutbox } from '../lib/sync';

const { width } = Dimensions.get('window');

// Data models for Active Workout
type SetModel = { id: string, weight_kg: string, reps: string, rpe?: string, rir?: string, completed: boolean, suggestedWeight?: string, suggestedReps?: string };
type ExerciseModel = { id: string, session_exercise_id: string, name: string, muscle_group: string, sets: SetModel[] };
type SessionModel = { id: string, startTime: number };

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  
  const [session, setSession] = useState<SessionModel | null>(null);
  const [exercises, setExercises] = useState<ExerciseModel[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Timers and Alerts state
  const [timerTrigger, setTimerTrigger] = useState(0);
  const [activeExerciseName, setActiveExerciseName] = useState('');
  const [completedSetsCount, setCompletedSetsCount] = useState(0);

  useEffect(() => { initWorkout().catch((error) => { console.warn('[workout] initialization failed', error); setLoading(false); }); }, [params.exercises, params.resumeSessionId, user?.id]);

  const initWorkout = async () => {
    if (!user) return;
    setLoading(true);
    const db = await getDb();

    if (params.resumeSessionId) {
      // P0: Crash Recovery: Load existing session from SQLite
      const sessionId = params.resumeSessionId as string;
      const sessionRow = await db.getFirstAsync<{ id: string, date: string }>(
        `SELECT * FROM workout_sessions WHERE id = ? AND user_id = ? AND is_finished = 0`, [sessionId, user.id],
      );
      if (sessionRow) {
        setSession({ id: sessionRow.id, startTime: new Date(sessionRow.date).getTime() });
        
        // Load exercises
        const seRows = await db.getAllAsync<{id: string, exercise_id: string, name: string, muscle_group: string}>(
          `SELECT se.id, se.exercise_id, e.name, e.muscle_group FROM session_exercises se LEFT JOIN exercises e ON se.exercise_id = e.id WHERE se.session_id = ? ORDER BY se.order_index ASC`,
          [sessionId]
        );
        
        const loadedExercises: ExerciseModel[] = [];
        let compSets = 0;

        for (const se of seRows) {
          const setsRows = await db.getAllAsync<{id: string, weight_kg: number, reps: number, rpe: number, rir: number, completed: boolean}>(
            `SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_number ASC`, [se.id]
          );
          
          const mappedSets = setsRows.map(s => {
            if (s.completed) compSets++;
            return {
              id: s.id,
              weight_kg: s.weight_kg ? s.weight_kg.toString() : '',
              reps: s.reps ? s.reps.toString() : '',
              rpe: s.rpe ? s.rpe.toString() : '',
              rir: s.rir ? s.rir.toString() : '',
              completed: !!s.completed
            };
          });
          
          loadedExercises.push({
            id: se.exercise_id,
            session_exercise_id: se.id,
            name: se.name || 'Unknown',
            muscle_group: se.muscle_group || 'Unknown',
            sets: mappedSets
          });
        }
        
        setExercises(loadedExercises);
        setCompletedSetsCount(compSets);
        if (loadedExercises.length > 0) setActiveExerciseName(loadedExercises[0].name);
      }
    } else if (params.exercises) {
      // New Session: Initialize SQLite state
      try {
        const parsed = JSON.parse(params.exercises as string);
        const sessionId = generateUUID();
        const dateIso = new Date().toISOString();
        const startTime = new Date(dateIso).getTime();
        
        setSession({ id: sessionId, startTime });
        
        // P0: Durable Active Workout local write
        await upsertLocalExercises(parsed.map((exercise: { id: string; name: string; muscle_group?: string }) => ({ id: exercise.id, name: exercise.name, muscle_group: exercise.muscle_group })));
        await db.runAsync(
          `INSERT INTO workout_sessions (id, user_id, date, split_type, split_day, duration_minutes, is_finished, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [sessionId, user.id, dateIso, 'custom', 'Custom', 0, dateIso, dateIso]
        );
        
        const initEx: ExerciseModel[] = [];
        for (const [exerciseIndex, ex] of parsed.entries()) {
          const seId = generateUUID();
          await db.runAsync(
            `INSERT INTO session_exercises (id, session_id, exercise_id, order_index) VALUES (?, ?, ?, ?)`,
            [seId, sessionId, ex.id, exerciseIndex]
          );
          
          const sets: SetModel[] = [];
          // Init 3 empty sets
          for (let i = 0; i < 3; i++) {
            const setId = generateUUID();
            await db.runAsync(
              `INSERT INTO sets (id, session_exercise_id, set_number, weight_kg, reps, completed) VALUES (?, ?, ?, ?, ?, 0)`,
              [setId, seId, i + 1, null, null]
            );
            sets.push({ id: setId, weight_kg: '', reps: '', completed: false });
          }
          
          initEx.push({
            id: ex.id,
            session_exercise_id: seId,
            name: ex.name,
            muscle_group: ex.muscle_group,
            sets
          });
        }
        
        setExercises(initEx);
        if (initEx.length > 0) setActiveExerciseName(initEx[0].name);
        
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  };

  const persistSet = async (targetSet: SetModel, setNumber: number) => {
    try {
      const db = await getDb();
      await db.runAsync(
        `UPDATE sets SET set_number = ?, completed = ?, weight_kg = ?, reps = ?, rpe = ?, rir = ? WHERE id = ?`,
        [
          setNumber,
          targetSet.completed ? 1 : 0, 
          targetSet.weight_kg ? parseFloat(targetSet.weight_kg) : null,
          targetSet.reps ? parseInt(targetSet.reps) : null,
          targetSet.rpe ? parseInt(targetSet.rpe) : null,
          targetSet.rir ? parseInt(targetSet.rir) : null,
          targetSet.id
        ]
      );
    } catch (e) {
      console.error('Failed to update local DB:', e);
    }
  };

  const toggleSet = async (exIndex: number, setIndex: number) => {
    const updated = exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set })) }));
    const targetSet = updated[exIndex].sets[setIndex];
    if (!targetSet.completed && (!Number.isFinite(Number(targetSet.weight_kg)) || Number(targetSet.weight_kg) < 0 || !Number.isInteger(Number(targetSet.reps)) || Number(targetSet.reps) < 1)) {
      Alert.alert('Complete the set details', 'Enter a valid weight and at least one rep before marking a set complete.');
      return;
    }
    targetSet.completed = !targetSet.completed;
    await persistSet(targetSet, setIndex + 1);

    if (targetSet.completed) {
      setTimerTrigger(prev => prev + 1);
      setActiveExerciseName(updated[exIndex].name);
      setCompletedSetsCount(prev => prev + 1);
    } else {
      setCompletedSetsCount(prev => Math.max(0, prev - 1));
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

  const [isFinishing, setIsFinishing] = useState(false);

  const finishWorkout = async () => {
    if (!user || !session || isFinishing) return;
    setIsFinishing(true);
    
    try {
      const duration = Math.max(1, Math.round((new Date().getTime() - session.startTime) / 60000));
      const db = await getDb();
      const completedExercises = exercises.map((exercise, exerciseIndex) => ({
        id: exercise.session_exercise_id, exercise_id: exercise.id, order_index: exerciseIndex,
        sets: exercise.sets.filter((set) => set.completed).map((set, setIndex) => ({
          id: set.id, set_number: setIndex + 1, weight_kg: Number(set.weight_kg), reps: Number(set.reps),
          completed: true, rpe: set.rpe ? Number(set.rpe) : null, rir: set.rir ? Number(set.rir) : null,
        })),
      })).filter((exercise) => exercise.sets.length > 0);
      if (!completedExercises.length) {
        Alert.alert('No completed sets', 'Complete at least one valid set before finishing your workout.');
        setIsFinishing(false);
        return;
      }
      const workout = { id: session.id, date: new Date(session.startTime).toISOString(), split_type: 'custom', split_day: 'Custom', duration_minutes: duration, is_finished: true, exercises: completedExercises };
      await db.withTransactionAsync(async () => {
        for (const exercise of exercises) {
          for (const [setIndex, set] of exercise.sets.entries()) await persistSet(set, setIndex + 1);
        }
        await db.runAsync(`UPDATE workout_sessions SET is_finished = 1, duration_minutes = ?, updated_at = ? WHERE id = ? AND user_id = ?`, [duration, new Date().toISOString(), session.id, user.id]);
        await queueCompletedWorkout(user.id, workout);
      });
      processOutbox(user.id).catch(() => undefined);
      Alert.alert('Saved locally', 'Your workout is safely saved on this device and will sync when the connection succeeds.');
      router.replace('/(tabs)/history');
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setIsFinishing(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safeArea}><ActivityIndicator color="#0ea5e9" /></SafeAreaView>;
  }

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
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.muscleGroup}>{ex.muscle_group}</Text>
              
              <View style={styles.setsHeader}>
                <Text style={styles.colHeader}>Set</Text>
                <Text style={styles.colHeader}>kg</Text>
                <Text style={styles.colHeader}>Reps</Text>
                {/* P1: RPE/RIR Headers */}
                <Text style={styles.colHeaderSlim}>RPE</Text>
                <Text style={styles.colHeaderSlim}>RIR</Text>
                <Text style={styles.colHeader}>Done</Text>
              </View>

              {ex.sets.map((set: any, setIndex: number) => (
                <View key={setIndex} style={[styles.setRow, set.completed && styles.setCompletedRow]}>
                  <Text style={styles.setText}>{setIndex + 1}</Text>
                  
                  <TextInput 
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="numeric"
                    value={set.weight_kg}
                    onChangeText={(val) => {
                      const updated = [...exercises];
                      let parsed = parseFloat(val);
                      if (val === '') updated[exIndex].sets[setIndex].weight_kg = '';
                      else if (!isNaN(parsed) && parsed >= 0) {
                        updated[exIndex].sets[setIndex].weight_kg = val;
                      }
                      setExercises(updated);
                    }}
                    onBlur={() => { persistSet(set, setIndex + 1).catch(() => undefined); }}
                  />
                  
                  <TextInput 
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="numeric"
                    value={set.reps}
                    onChangeText={(val) => {
                      const updated = [...exercises];
                      let parsed = parseInt(val);
                      if (val === '') updated[exIndex].sets[setIndex].reps = '';
                      else if (!isNaN(parsed) && parsed >= 0) {
                        updated[exIndex].sets[setIndex].reps = parsed.toString();
                      }
                      setExercises(updated);
                    }}
                    onBlur={() => { persistSet(set, setIndex + 1).catch(() => undefined); }}
                  />

                  {/* P1: Optional RPE/RIR fields with validation */}
                  <TextInput 
                    style={styles.inputSlim}
                    placeholder="-"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    keyboardType="numeric"
                    value={set.rpe}
                    onChangeText={(val) => {
                      const updated = [...exercises];
                      let parsed = parseInt(val);
                      if (val === '') updated[exIndex].sets[setIndex].rpe = '';
                      else if (!isNaN(parsed)) {
                        parsed = Math.max(1, Math.min(10, parsed)); // Clamp RPE 1-10
                        updated[exIndex].sets[setIndex].rpe = parsed.toString();
                      }
                      setExercises(updated);
                    }}
                    onBlur={() => { persistSet(set, setIndex + 1).catch(() => undefined); }}
                  />

                  <TextInput 
                    style={styles.inputSlim}
                    placeholder="-"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    keyboardType="numeric"
                    value={set.rir}
                    onChangeText={(val) => {
                      const updated = [...exercises];
                      let parsed = parseInt(val);
                      if (val === '') updated[exIndex].sets[setIndex].rir = '';
                      else if (!isNaN(parsed)) {
                        parsed = Math.max(0, Math.min(10, parsed)); // Clamp RIR 0-10
                        updated[exIndex].sets[setIndex].rir = parsed.toString();
                      }
                      setExercises(updated);
                    }}
                    onBlur={() => { persistSet(set, setIndex + 1).catch(() => undefined); }}
                  />
                  
                  <TouchableOpacity 
                    style={[styles.checkBtn, set.completed && styles.checkBtnActive]}
                    onPress={() => toggleSet(exIndex, setIndex)}
                  >
                    {set.completed && <Check color="#fff" size={16} />}
                  </TouchableOpacity>
                </View>
              ))}
            </GlassCard>
          </View>
        ))}
      </ScrollView>
      
      <View style={styles.overlays}>
        {/* Pass timestamp instead of relying on ticking intervals, but WorkoutTimer manages its own display */}
        <WorkoutTimer triggerCount={timerTrigger} activeExerciseName={activeExerciseName} />
      </View>
      <HydrationAlert completedSetsCount={completedSetsCount} />
      
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
  page: { width, padding: 16, justifyContent: 'center' },
  card: { padding: 16 },
  exerciseName: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  muscleGroup: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 20 },
  setsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  colHeader: { color: 'rgba(255,255,255,0.5)', fontSize: 13, width: 45, textAlign: 'center' },
  colHeaderSlim: { color: 'rgba(255,255,255,0.5)', fontSize: 12, width: 30, textAlign: 'center' },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 6,
    borderRadius: 8,
    marginBottom: 6,
  },
  setCompletedRow: { backgroundColor: 'rgba(14, 165, 233, 0.15)' },
  setText: { color: '#fff', fontSize: 14, width: 35, textAlign: 'center' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    width: 50,
    height: 36,
    color: '#fff',
    textAlign: 'center',
    fontSize: 15,
  },
  inputSlim: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    width: 35,
    height: 36,
    color: '#fff',
    textAlign: 'center',
    fontSize: 13,
  },
  checkBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  checkBtnActive: { backgroundColor: '#10b981' },
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
