import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, LogOut, Settings2, Users } from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const identity = typeof user?.user_metadata?.name === 'string' && user.user_metadata.name.trim()
    ? user.user_metadata.name.trim()
    : user?.email?.split('@')[0] || 'Athlete';
  const initial = identity.slice(0, 1).toUpperCase();
  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) router.replace('/(auth)/sign-in');
  };
  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.ambient} />
      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
        <View style={styles.heroCopy}><Text style={styles.eyebrow}>ATHLETE PROFILE</Text><Text style={styles.name}>{identity}</Text><Text numberOfLines={1} style={styles.email}>{user?.email || 'Your private training space'}</Text></View>
      </View>
      <View style={styles.identitySurface}>
        <Text style={styles.eyebrow}>YOUR TRAINING SPACE</Text>
        <Text style={styles.identityTitle}>Your work,{"\n"}kept honestly.</Text>
        <Text style={styles.identityCopy}>Account details, workout import, and preferences stay connected to your signed-in account.</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" style={styles.row} onPress={() => router.push('/settings')}>
        <View style={[styles.rowIcon, styles.settingsIcon]}><Settings2 color="#0876d1" size={19} /></View>
        <View style={styles.rowCopy}><Text style={styles.rowTitle}>Training & account</Text><Text style={styles.rowDetail}>Preferences, import, and sign out</Text></View><ChevronRight color="#7590ac" size={20} />
      </TouchableOpacity>
      <View style={styles.row}>
        <View style={[styles.rowIcon, styles.athleteIcon]}><Users color="#5c54c8" size={19} /></View>
        <View style={styles.rowCopy}><Text style={styles.rowTitle}>Athlete space</Text><Text style={styles.rowDetail}>Social features appear only with verified data.</Text></View>
      </View>
      <TouchableOpacity accessibilityRole="button" style={styles.signOut} onPress={logout}><LogOut color="#bc3b3b" size={18} /><Text style={styles.signOutText}>Sign out on this device</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingTop: 27, paddingBottom: 122 },
  ambient: { position: 'absolute', width: 300, height: 300, borderRadius: 150, right: -142, top: -120, backgroundColor: 'rgba(93, 179, 255, 0.16)' },
  hero: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  avatar: { width: 70, height: 70, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#287fe3', borderWidth: 3, borderColor: 'rgba(255,255,255,0.92)', shadowColor: '#2167b2', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  avatarText: { color: '#fff', fontSize: 29, fontWeight: '800' },
  heroCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  eyebrow: { color: '#71829a', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  name: { color: '#132640', fontSize: 30, lineHeight: 33, letterSpacing: -1.5, fontWeight: '800', marginTop: 3 },
  email: { color: '#6b7d94', fontSize: 12, marginTop: 3 },
  identitySurface: { overflow: 'hidden', borderRadius: 30, padding: 25, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(234, 246, 255, 0.86)', shadowColor: '#295880', shadowOpacity: 0.10, shadowRadius: 21, shadowOffset: { width: 0, height: 10 } },
  identityTitle: { color: '#142740', fontSize: 35, lineHeight: 33, letterSpacing: -1.9, fontWeight: '800', marginTop: 8 },
  identityCopy: { color: '#5f758c', fontSize: 13, lineHeight: 19, marginTop: 13, maxWidth: 280 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 13, marginBottom: 10, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', backgroundColor: 'rgba(255,255,255,0.60)', shadowColor: '#284b70', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  rowIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { backgroundColor: 'rgba(205,239,255,0.84)' }, athleteIcon: { backgroundColor: 'rgba(231,226,255,0.86)' },
  rowCopy: { flex: 1, minWidth: 0, marginLeft: 12 }, rowTitle: { color: '#17304d', fontSize: 14, fontWeight: '800' }, rowDetail: { color: '#718299', fontSize: 11, marginTop: 3 },
  signOut: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 17, minHeight: 48, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(208,73,65,0.25)', backgroundColor: 'rgba(255,241,240,0.72)' },
  signOutText: { color: '#bc3b3b', fontSize: 13, fontWeight: '800' },
});
