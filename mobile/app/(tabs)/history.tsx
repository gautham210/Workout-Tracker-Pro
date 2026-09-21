import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import GlassCard from '../../components/GlassCard';
import { Calendar, TrendingUp, ChevronRight, Activity } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

export default function HistoryScreen() {
  const { user } = useAuth();
  const [weight, setWeight] = useState('');
  const [currentWeight, setCurrentWeight] = useState('-- kg');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ volumeTrend: '+0%', workoutsPerMonth: 0 });

  useEffect(() => {
    if (user) {
      loadHistory();
      loadBodyweight();
    }
  }, [user]);

  const loadHistory = async () => {
    if (!user) return;
    try {
      const { data: sessions, error } = await supabase
        .from('workout_sessions')
        .select('id, date, split_day, duration_minutes, session_exercises(id, sets(weight_kg, reps, completed))')
        .eq('user_id', user.id)
        .eq('is_finished', true)
        .order('date', { ascending: false })
        .limit(10);
        
      if (error) throw error;

      const formattedHistory = (sessions || []).map(s => {
        let totalVolume = 0;
        s.session_exercises?.forEach((se: any) => {
          se.sets?.filter((set: any) => set.completed).forEach((set: any) => {
            const w = parseFloat(set.weight_kg) || 0;
            const r = parseInt(set.reps) || 0;
            totalVolume += (w * r);
          });
        });

        return {
          id: s.id,
          date: new Date(s.date).toLocaleDateString(),
          split: s.split_day || 'Workout',
          volume: `${totalVolume} kg`,
          duration: `${s.duration_minutes ?? '--'} min`
        };
      });

      setHistory(formattedHistory);
      const volumes = formattedHistory.map((entry) => Number.parseFloat(entry.volume) || 0);
      const midpoint = Math.floor(volumes.length / 2);
      const newer = volumes.slice(0, midpoint).reduce((sum, value) => sum + value, 0);
      const older = volumes.slice(midpoint).reduce((sum, value) => sum + value, 0);
      const volumeTrend = older > 0 ? `${newer >= older ? '+' : ''}${Math.round(((newer - older) / older) * 100)}%` : '—';
      setStats({ volumeTrend, workoutsPerMonth: sessions?.length || 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadBodyweight = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('bodyweight_logs')
      .select('weight_kg')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1)
      .single();
      
    if (data) setCurrentWeight(`${data.weight_kg} kg`);
  };

  const handleLogWeight = async () => {
    if (!user || !weight) return;
    const w = parseFloat(weight);
    if (!Number.isFinite(w) || w <= 0 || w > 1000) { Alert.alert('Invalid weight', 'Enter a weight between 0 and 1000 kg.'); return; }
    
    const { error } = await supabase
      .from('bodyweight_logs')
      .insert({ user_id: user.id, weight_kg: w, date: new Date().toISOString() });
      
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCurrentWeight(`${w} kg`);
      setWeight('');
      Alert.alert('Success', 'Bodyweight logged successfully.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.headerTitle}>Analytics & History</Text>

        <Text style={styles.sectionTitle}>Bodyweight Logging</Text>
        <GlassCard style={styles.weightCard}>
          <View style={styles.weightRow}>
            <View>
              <Text style={styles.weightLabel}>Current Weight</Text>
              <Text style={styles.weightValue}>{currentWeight}</Text>
            </View>
            <View style={styles.inputGroup}>
              <TextInput 
                style={styles.input} 
                placeholder="78.5" 
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numeric"
                value={weight}
                onChangeText={setWeight}
              />
              <TouchableOpacity style={styles.logButton} onPress={handleLogWeight}>
                <Text style={styles.logBtnText}>Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassCard>

        <Text style={styles.sectionTitle}>Performance Analytics</Text>
        <View style={styles.analyticsGrid}>
          <GlassCard style={styles.statCard}>
            <TrendingUp color="#0ea5e9" size={24} style={styles.statIcon} />
            <Text style={styles.statValue}>{stats.volumeTrend}</Text>
            <Text style={styles.statLabel}>Volume Trend</Text>
          </GlassCard>
          
          <GlassCard style={styles.statCard}>
            <Activity color="#10b981" size={24} style={styles.statIcon} />
            <Text style={styles.statValue}>{stats.workoutsPerMonth}</Text>
            <Text style={styles.statLabel}>Workouts / mo</Text>
          </GlassCard>
        </View>

        <Text style={styles.sectionTitle}>Timeline</Text>
        {loading ? (
          <ActivityIndicator color="#0ea5e9" style={{ marginTop: 20 }} />
        ) : history.length === 0 ? (
          <GlassCard style={styles.historyCard}>
            <Text style={{ color: '#68758a', textAlign: 'center' }}>No workouts logged yet. Your completed sessions will appear here.</Text>
          </GlassCard>
        ) : (
          history.map((session) => (
            <GlassCard key={session.id} style={styles.historyCard}>
              <View style={styles.historyRow}>
                <View style={styles.historyIconBox}>
                  <Calendar color="#007aff" size={20} />
                </View>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyDate}>{session.date}</Text>
                  <Text style={styles.historySplit}>{session.split}</Text>
                  <Text style={styles.historyStats}>{session.duration} • {session.volume}</Text>
                </View>
                <ChevronRight color="#8a96a8" size={24} />
              </View>
            </GlassCard>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f8fc' },
  container: { flex: 1, padding: 16 },
  headerTitle: { color: '#172033', fontSize: 28, fontWeight: '700', marginBottom: 24, marginTop: 16, letterSpacing: -0.8 },
  sectionTitle: { color: '#172033', fontSize: 18, fontWeight: '600', marginBottom: 12, marginTop: 12 },
  
  weightCard: { padding: 20, marginBottom: 16 },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weightLabel: { color: '#68758a', fontSize: 14, marginBottom: 4 },
  weightValue: { color: '#172033', fontSize: 28, fontWeight: '700' },
  inputGroup: { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: '#f0f3f8', borderRadius: 10, padding: 12, color: '#172033', width: 70, textAlign: 'center', marginRight: 8 },
  logButton: { backgroundColor: '#007aff', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  logBtnText: { color: '#fff', fontWeight: 'bold' },

  analyticsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, padding: 16, alignItems: 'center' },
  statIcon: { marginBottom: 12 },
  statValue: { color: '#172033', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  statLabel: { color: '#68758a', fontSize: 12 },

  historyCard: { padding: 16, marginBottom: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  historyIconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,122,255,0.10)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  historyDetails: { flex: 1 },
  historyDate: { color: '#172033', fontSize: 16, fontWeight: '600' },
  historySplit: { color: '#4d5d73', fontSize: 14, marginVertical: 2 },
  historyStats: { color: '#7a8799', fontSize: 12 },
});
