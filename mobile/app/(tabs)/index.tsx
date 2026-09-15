import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../../components/GlassCard';
import { Activity, Flame, ChevronRight, Zap } from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { generateInsights, Insight } from '../../lib/insights';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setRefreshing(true);
    if (!user) {
      setRefreshing(false);
      return;
    }
    const data = await generateInsights(user.id);
    setInsights(data);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#0ea5e9" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Ready to crush it,</Text>
            <Text style={styles.name}>{user?.email?.split('@')[0] || 'Athlete'}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn}>
            <Text style={{ fontSize: 24 }}>⚙️</Text>
          </TouchableOpacity>
        </View>

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
