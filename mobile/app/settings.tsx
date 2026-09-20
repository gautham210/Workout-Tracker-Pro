import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../components/GlassCard';
import { UploadCloud, ArrowLeft, CheckCircle } from 'lucide-react-native';
import { parseWorkoutFromText } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { generateUUID, getDb, upsertLocalExercises } from '../lib/db';
import { queueCompletedWorkout, processOutbox } from '../lib/sync';
import { supabase } from '../lib/supabase';

type ParsedSet = { weight_kg: number; reps: number };
type ParsedExercise = { name: string; sets: ParsedSet[] };
type CatalogExercise = { id: string; name: string; muscle_group?: string | null; description?: string | null };
type ResolvedExercise = { catalogExercise: CatalogExercise; sets: ParsedSet[]; index: number };

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [logText, setLogText] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleImport = async () => {
    if (!logText.trim() || !user) return;
    
    setLoading(true);
    setSuccess(false);

    try {
      const parsed = await parseWorkoutFromText(logText, []);
      const parsedExercises: ParsedExercise[] = Array.isArray(parsed.exercises) ? parsed.exercises : [];
      const names = parsedExercises.map((exercise: { name?: string }) => exercise.name).filter(Boolean);
      const { data: catalog, error: catalogError } = await supabase.from('exercises').select('id,name,muscle_group,description').in('name', names);
      if (catalogError) throw new Error('Could not verify parsed exercises against the exercise catalog.');
      const catalogExercises = (catalog || []) as CatalogExercise[];
      const byName = new Map(catalogExercises.map((exercise) => [exercise.name.toLowerCase(), exercise]));
      const resolved: ResolvedExercise[] = parsedExercises.flatMap((exercise, index) => {
        const catalogExercise = byName.get(exercise.name.toLowerCase());
        const sets: ParsedSet[] = Array.isArray(exercise.sets) ? exercise.sets.filter((set: ParsedSet) => Number.isFinite(set.weight_kg) && set.weight_kg >= 0 && Number.isInteger(set.reps) && set.reps > 0) : [];
        return catalogExercise && sets.length ? [{ catalogExercise, sets, index }] : [];
      });
      if (!resolved.length) throw new Error('No parsed exercises matched the exercise catalog. Review the log and try again.');
      const id = generateUUID();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || '') ? `${parsed.date}T12:00:00.000Z` : new Date().toISOString();
      const workout = {
        id, date, split_type: 'imported', split_day: typeof parsed.split === 'string' ? parsed.split.slice(0, 80) : 'Imported', duration_minutes: null, is_finished: true,
        exercises: resolved.map(({ catalogExercise, sets, index }) => ({ id: generateUUID(), exercise_id: catalogExercise.id, order_index: index, sets: sets.map((set, setIndex) => ({ id: generateUUID(), set_number: setIndex + 1, weight_kg: set.weight_kg, reps: set.reps, completed: true, rpe: null, rir: null })) })),
      };
      const db = await getDb();
      await upsertLocalExercises(resolved.map(({ catalogExercise }) => catalogExercise));
      await db.withTransactionAsync(async () => {
        const now = new Date().toISOString();
        await db.runAsync(`INSERT INTO workout_sessions (id,user_id,date,split_type,split_day,duration_minutes,is_finished,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`, [id, user.id, date, 'imported', workout.split_day, null, now, now]);
        for (const exercise of workout.exercises) {
          await db.runAsync(`INSERT INTO session_exercises (id,session_id,exercise_id,order_index) VALUES (?,?,?,?)`, [exercise.id, id, exercise.exercise_id, exercise.order_index]);
          for (const set of exercise.sets) await db.runAsync(`INSERT INTO sets (id,session_exercise_id,set_number,weight_kg,reps,completed,rpe,rir) VALUES (?,?,?,?,?,1,?,?)`, [set.id, exercise.id, set.set_number, set.weight_kg, set.reps, null, null]);
        }
        await queueCompletedWorkout(user.id, workout);
      });
      processOutbox(user.id).catch(() => undefined);
      setSuccess(true);
      setLogText('');
      Alert.alert('Saved locally', `Imported ${resolved.length} exercise${resolved.length === 1 ? '' : 's'} and queued it for sync.`);
    } catch (err: any) {
      Alert.alert("Import Failed", err.message || "Failed to reach AI parser endpoint.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings & Import</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container}>
        <Text style={styles.sectionTitle}>AI Log Import</Text>
        <GlassCard style={styles.card}>
          <Text style={styles.description}>
            Paste your raw workout logs from Apple Notes, WhatsApp, or anywhere else. Our AI will automatically parse the exercises, sets, and weights into your history.
          </Text>
          
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={8}
            placeholder="e.g. Monday Chest Day: Bench 100kg x 8, 100kg x 6. Incline DB 40kg 3x10..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={logText}
            onChangeText={setLogText}
            textAlignVertical="top"
          />

          <TouchableOpacity 
            style={[styles.importButton, (!logText.trim() || loading) && styles.disabledBtn]} 
            onPress={handleImport}
            disabled={!logText.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : success ? (
              <>
                <CheckCircle color="#fff" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.importBtnText}>Imported Successfully</Text>
              </>
            ) : (
              <>
                <UploadCloud color="#fff" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.importBtnText}>Parse & Import Logs</Text>
              </>
            )}
          </TouchableOpacity>
        </GlassCard>

        <Text style={styles.sectionTitle}>App Preferences</Text>
        <GlassCard style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingText}>Theme</Text>
            <Text style={styles.settingValue}>Liquid Dark (Locked)</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingText}>Units</Text>
            <Text style={styles.settingValue}>Kilograms (kg)</Text>
          </View>
        </GlassCard>

        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={async () => {
            const { error } = await supabase.auth.signOut();
            if (error) { Alert.alert('Sign out failed', error.message); return; }
            router.replace('/(auth)/sign-in');
          }}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
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
  backBtn: { padding: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  container: { flex: 1, padding: 16 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12, marginTop: 12 },
  card: { padding: 20, marginBottom: 16 },
  description: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  textArea: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    minHeight: 120,
    marginBottom: 16,
  },
  importButton: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.5 },
  importBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  settingText: { color: '#fff', fontSize: 16 },
  settingValue: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
  logoutButton: { marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', alignItems: 'center' },
  logoutText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
});
