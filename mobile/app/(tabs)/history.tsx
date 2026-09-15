import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import GlassCard from '../../components/GlassCard';
import { Calendar, TrendingUp, ChevronRight, Activity } from 'lucide-react-native';

const MOCK_HISTORY = [
  { id: '1', date: 'Today', split: 'Push Day', volume: '3,240 kg', duration: '45 min' },
  { id: '2', date: 'Yesterday', split: 'Pull Day', volume: '4,100 kg', duration: '55 min' },
  { id: '3', date: 'Oct 12', split: 'Legs', volume: '5,500 kg', duration: '60 min' },
];

export default function HistoryScreen() {
  const [weight, setWeight] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.headerTitle}>Analytics & History</Text>

        <Text style={styles.sectionTitle}>Bodyweight Logging</Text>
        <GlassCard style={styles.weightCard}>
          <View style={styles.weightRow}>
            <View>
              <Text style={styles.weightLabel}>Current Weight</Text>
              <Text style={styles.weightValue}>78.5 kg</Text>
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
              <TouchableOpacity style={styles.logButton}>
                <Text style={styles.logBtnText}>Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassCard>

        <Text style={styles.sectionTitle}>Performance Analytics</Text>
        <View style={styles.analyticsGrid}>
          <GlassCard style={styles.statCard}>
            <TrendingUp color="#0ea5e9" size={24} style={styles.statIcon} />
            <Text style={styles.statValue}>+12%</Text>
            <Text style={styles.statLabel}>Volume Trend</Text>
          </GlassCard>
          
          <GlassCard style={styles.statCard}>
            <Activity color="#10b981" size={24} style={styles.statIcon} />
            <Text style={styles.statValue}>14</Text>
            <Text style={styles.statLabel}>Workouts / mo</Text>
          </GlassCard>
        </View>

        <Text style={styles.sectionTitle}>Timeline</Text>
        {MOCK_HISTORY.map((session) => (
          <GlassCard key={session.id} style={styles.historyCard}>
            <View style={styles.historyRow}>
              <View style={styles.historyIconBox}>
                <Calendar color="#fff" size={20} />
              </View>
              <View style={styles.historyDetails}>
                <Text style={styles.historyDate}>{session.date}</Text>
                <Text style={styles.historySplit}>{session.split}</Text>
                <Text style={styles.historyStats}>{session.duration} • {session.volume}</Text>
              </View>
              <ChevronRight color="rgba(255,255,255,0.3)" size={24} />
            </View>
          </GlassCard>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, padding: 16 },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 24, marginTop: 16 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12, marginTop: 12 },
  
  weightCard: { padding: 20, marginBottom: 16 },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weightLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 4 },
  weightValue: { color: '#fff', fontSize: 28, fontWeight: '700' },
  inputGroup: { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, color: '#fff', width: 70, textAlign: 'center', marginRight: 8 },
  logButton: { backgroundColor: '#0ea5e9', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  logBtnText: { color: '#fff', fontWeight: 'bold' },

  analyticsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, padding: 16, alignItems: 'center' },
  statIcon: { marginBottom: 12 },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  statLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  historyCard: { padding: 16, marginBottom: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  historyIconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  historyDetails: { flex: 1 },
  historyDate: { color: '#fff', fontSize: 16, fontWeight: '600' },
  historySplit: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginVertical: 2 },
  historyStats: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
});
