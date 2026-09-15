import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../../components/GlassCard';
import { Activity, Flame, ChevronRight, Zap, Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { generateInsights, Insight } from '../../lib/insights';
import { getDb, clearLocalDb } from '../../lib/db';
import { Alert } from 'react-native';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [nextWorkout, setNextWorkout] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unfinishedSessionId, setUnfinishedSessionId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('Synced');

  useEffect(() => {
    let unsubscribe: () => void;
    import('../../lib/sync').then(({ onSyncStatusChange, getSyncStatus }) => {
      setSyncStatus(getSyncStatus());
      unsubscribe = onSyncStatusChange((s) => setSyncStatus(s));
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const checkUnfinishedSession = async () => {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM workout_sessions WHERE is_finished = 0 ORDER BY date DESC LIMIT 1`
      );
      setUnfinishedSessionId(row ? row.id : null);
    } catch (e) {
      console.log('No SQLite DB yet or error checking sessions', e);
    }
  };

  const loadData = async () => {
    setRefreshing(true);
    await checkUnfinishedSession();
    if (!user) {
      setRefreshing(false);
      return;
    }
    const { insights: data, nextWorkout: nextW } = await generateInsights(user.id);
    setInsights(data);
    setNextWorkout(nextW);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const discardSession = async () => {
    Alert.alert('Discard', 'Are you sure you want to discard this workout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => {
        const db = await getDb();
        if (unfinishedSessionId) {
          await db.runAsync(`DELETE FROM workout_sessions WHERE id = ?`, [unfinishedSessionId]);
          setUnfinishedSessionId(null);
        }
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#0ea5e9" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Ready to train,</Text>
            <Text style={styles.name}>{user?.email?.split('@')[0] || 'Athlete'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
              {syncStatus === 'Synced' ? (
                <CheckCircle2 color="#10b981" size={16} />
              ) : syncStatus === 'Syncing' ? (
                <RefreshCw color="#0ea5e9" size={16} />
              ) : syncStatus === 'Saved locally' ? (
                <Cloud color="#f59e0b" size={16} />
              ) : (
                <CloudOff color="#ef4444" size={16} />
              )}
              <Text style={{ color: 'white', fontSize: 12, marginLeft: 6 }}>{syncStatus}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn}>
              <Text style={{ fontSize: 24 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Crash Recovery Prompt */}
        {unfinishedSessionId && (
          <GlassCard style={[styles.insightCard, { borderColor: '#ef4444', borderWidth: 1 }]}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
              Active Workout Detected
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
              It looks like you didn't finish your last workout session.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: '#0ea5e9', padding: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => router.push({ pathname: '/active-workout', params: { resumeSessionId: unfinishedSessionId } })}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={discardSession}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Discard</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        {/* Next Workout */}
        {nextWorkout && (
          <GlassCard style={{ marginBottom: 16, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 }}>UPCOMING SESSION</Text>
              <Text style={{ color: '#10b981', fontSize: 14, fontWeight: 'bold' }}>{nextWorkout.split}</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 8 }}>{nextWorkout.focus}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 }}>{nextWorkout.reason}</Text>
            <TouchableOpacity 
              style={{ marginTop: 16, backgroundColor: '#0ea5e9', padding: 12, borderRadius: 8, alignItems: 'center' }}
              onPress={() => router.push('/(tabs)/workout')}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Plan Workout</Text>
            </TouchableOpacity>
          </GlassCard>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/workout')}>
            <GlassCard style={styles.actionCard}>
              <Activity color="#0ea5e9" size={32} />
              <Text style={styles.actionText}>Start Session</Text>
            </GlassCard>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/coach')}>
            <GlassCard style={styles.actionCard}>
              <Flame color="#ef4444" size={32} />
              <Text style={styles.actionText}>Ask AI Coach</Text>
            </GlassCard>
          </TouchableOpacity>
        </View>

        {/* AI Insights Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>AI Insights</Text>
          <Zap color="#f59e0b" size={20} />
        </View>
        
        {insights.length === 0 && !refreshing ? (
          <GlassCard style={styles.insightCard}>
            <Text style={{ color: 'rgba(255,255,255,0.6)' }}>More data needed to generate insights.</Text>
          </GlassCard>
        ) : (
          insights.map(insight => (
            <GlassCard key={insight.id} style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
              </View>
              
              <Text style={styles.insightLabel}>WHAT HAPPENED</Text>
              <Text style={styles.insightText}>{insight.whatHappened}</Text>
              
              <Text style={styles.insightLabel}>EVIDENCE</Text>
              <Text style={styles.insightText}>{insight.evidence}</Text>
              
              <Text style={styles.insightLabel}>WHY IT MATTERS</Text>
              <Text style={styles.insightText}>{insight.whyItMatters}</Text>
              
              <View style={styles.actionBox}>
                <Text style={styles.insightLabelAction}>WHAT TO DO NEXT</Text>
                <Text style={styles.insightTextAction}>{insight.whatToDoNext}</Text>
              </View>
            </GlassCard>
          ))
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, padding: 16 },
  header: { marginTop: 24, marginBottom: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsBtn: { width: 44, height: 44, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 18 },
  name: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  
  quickActions: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  actionButton: { flex: 1 },
  actionCard: { alignItems: 'center', padding: 24 },
  actionText: { color: '#fff', marginTop: 12, fontSize: 16, fontWeight: '600' },
  
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginRight: 8 },
  
  insightCard: { padding: 20, marginBottom: 16 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  insightTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  insightLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  insightText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  
  actionBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  insightLabelAction: { color: '#0ea5e9', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  insightTextAction: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
