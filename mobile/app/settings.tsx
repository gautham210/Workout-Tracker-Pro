import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import GlassCard from '../components/GlassCard';
import { UploadCloud, ArrowLeft, CheckCircle } from 'lucide-react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const [logText, setLogText] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleImport = () => {
    if (!logText.trim()) return;
    
    setLoading(true);
    setSuccess(false);

    // Mock API call to parser endpoint
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setLogText('');
      Alert.alert("Import Successful", "Your workout logs were parsed and added to your history.");
    }, 2000);
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
});
