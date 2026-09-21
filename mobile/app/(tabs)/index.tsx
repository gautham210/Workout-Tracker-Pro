import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../../components/GlassCard';
import { Activity, Flame, ChevronRight, Zap, Cloud, CloudOff, RefreshCw, CheckCircle2, Dumbbell } from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { generateInsights, Insight } from '../../lib/insights';
import { getDb } from '../../lib/db';
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
    if (!user) { setUnfinishedSessionId(null); return; }
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM workout_sessions WHERE user_id = ? AND is_finished = 0 ORDER BY date DESC LIMIT 1`, [user.id]
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
        if (unfinishedSessionId && user) {
          await db.runAsync(`DELETE FROM workout_sessions WHERE id = ? AND user_id = ? AND is_finished = 0`, [unfinishedSessionId, user.id]);
          setUnfinishedSessionId(null);
        }
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#007aff" />}
      >
        <View style={styles.header}>
          <View><Text style={styles.overline}>TODAY</Text><Text style={styles.name}>{user?.email?.split('@')[0] || 'Athlete'}</Text></View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn}><Text style={{ fontSize: 20 }}>⚙</Text></TouchableOpacity>
        </View>

        <View style={styles.todayStage}>
          <Text style={styles.stageOverline}>TODAY'S TRAINING</Text>
          <Text style={styles.stageTitle}>{nextWorkout?.focus || 'Build your next session.'}</Text>
          <Text style={styles.stageCopy}>{nextWorkout?.reason || 'Choose movements that match how you want to train today.'}</Text>
          <TouchableOpacity style={styles.stageAction} onPress={() => router.push('/(tabs)/workout')}><Text style={styles.stageActionText}>Start workout</Text><ChevronRight color="#0755a8" size={18} /></TouchableOpacity>
          <View style={styles.stageOrb}><Dumbbell color="rgba(255,255,255,0.92)" size={74} /></View>
        </View>

        <TouchableOpacity
          style={styles.syncPill}
          onPress={() => { if (syncStatus.includes('failed') && user) import('../../lib/sync').then(({ processOutbox }) => processOutbox(user.id, true)); }}
          disabled={!syncStatus.includes('failed')}
        >
          {syncStatus === 'Synced' ? <CheckCircle2 color="#129357" size={15} /> : syncStatus === 'Syncing' ? <RefreshCw color="#007aff" size={15} /> : syncStatus === 'Saved locally' ? <Cloud color="#bd7610" size={15} /> : <CloudOff color="#c63731" size={15} />}
          <Text style={styles.syncLabel}>{syncStatus.includes('failed') ? 'Sync failed · Retry' : syncStatus}</Text>
        </TouchableOpacity>

        {/* Crash Recovery Prompt */}
        {unfinishedSessionId && (
          <GlassCard style={[styles.insightCard, { borderColor: '#ef4444', borderWidth: 1 }]}>
            <Text style={{ color: '#172033', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
              Active Workout Detected
            </Text>
            <Text style={{ color: '#68758a', marginBottom: 16 }}>
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
                <Text style={{ color: '#24324a', fontWeight: '600' }}>Discard</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        <View style={styles.quickActions}><TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/coach')}><View style={styles.actionCard}><Flame color="#7a55dc" size={24} /><Text style={styles.actionText}>Ask Coach</Text></View></TouchableOpacity><TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/nutrition')}><View style={styles.actionCard}><Zap color="#dc8b20" size={24} /><Text style={styles.actionText}>Scan meal</Text></View></TouchableOpacity></View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Training signal</Text><Activity color="#007aff" size={19} /></View>
        
        {insights.length === 0 && !refreshing ? (
          <View style={styles.insightCard}><Text style={{ color: '#68758a' }}>Finish a few workouts and your patterns will appear here.</Text></View>
        ) : (
          insights.map(insight => (
            <View key={insight.id} style={styles.insightCard}>
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
            </View>
          ))
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f8fc' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 126 },
  header: { marginTop: 12, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsBtn: { width: 42, height: 42, backgroundColor: 'rgba(255,255,255,0.84)', borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(28,48,82,0.08)' },
  overline: { color: '#7a8799', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  name: { color: '#172033', fontSize: 34, fontWeight: 'bold', letterSpacing: -1.2, marginTop: 3 },
  todayStage: { minHeight: 242, borderRadius: 28, backgroundColor: '#007aff', overflow: 'hidden', padding: 23, marginBottom: 10, shadowColor: '#006cd5', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  stageOverline: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  stageTitle: { color: '#fff', fontSize: 29, fontWeight: '800', letterSpacing: -1.1, lineHeight: 32, maxWidth: '65%', marginTop: 11 },
  stageCopy: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 19, maxWidth: '62%', marginTop: 8 },
  stageAction: { position: 'absolute', left: 23, bottom: 21, height: 43, paddingHorizontal: 15, gap: 7, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center' },
  stageActionText: { color: '#0755a8', fontSize: 13, fontWeight: '800' },
  stageOrb: { position: 'absolute', right: -23, bottom: -20, width: 158, height: 158, borderRadius: 79, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-10deg' }] },
  syncPill: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(28,48,82,0.06)', marginBottom: 23 },
  syncLabel: { color: '#526277', fontSize: 11, fontWeight: '800' },
  
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  actionButton: { flex: 1 },
  actionCard: { minHeight: 89, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(28,48,82,0.06)' },
  actionText: { color: '#172033', marginTop: 8, fontSize: 13, fontWeight: '700' },
  
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#172033', fontSize: 21, fontWeight: '700', letterSpacing: -0.5, marginRight: 8 },
  
  insightCard: { padding: 18, marginBottom: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.76)', borderWidth: 1, borderColor: 'rgba(28,48,82,0.06)' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  insightTitle: { color: '#172033', fontSize: 18, fontWeight: 'bold' },
  
  insightLabel: { color: '#7a8799', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  insightText: { color: '#24324a', fontSize: 14, lineHeight: 20 },
  
  actionBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,48,82,0.08)',
  },
  insightLabelAction: { color: '#007aff', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  insightTextAction: { color: '#24324a', fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
