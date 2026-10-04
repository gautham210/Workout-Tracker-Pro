import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, Utensils } from 'lucide-react-native';
import PlanChat from '../../components/PlanChat';
import { COLORS } from '../../lib/analyticsHooks';
import { useTabBarInset } from '../../lib/layout';

export default function CoachScreen() {
  const router = useRouter();
  const inset = useTabBarInset();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Sparkles color={COLORS.blueText} size={26} />
        <Text accessibilityRole="header" style={styles.title}>AI Coach</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the nutrition journal and nutritionist" hitSlop={8} onPress={() => router.push('/(tabs)/nutrition')} style={styles.link}>
          <Utensils color={COLORS.blueText} size={16} /><Text style={styles.linkText}>Nutrition</Text>
        </TouchableOpacity>
      </View>
      <PlanChat
        isNutritionist={false}
        accent={COLORS.blueText}
        greeting="Hi, I'm your AI coach. Ask for a workout, help with an exercise, or what to change when progress stalls."
        placeholder="Ask about workouts, form, or plateaus"
        disclaimer="AI-generated suggestions can be wrong and are not medical advice. The coach sees your profile, body metrics, nutrition targets, recent meals, and your latest workouts that have synced to your account (not workouts still waiting to sync), plus this conversation. This chat is kept in memory only and is cleared when the app restarts."
        bottomPad={inset.contentBottom - 12}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { flex: 1, color: COLORS.ink, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 },
  linkText: { color: COLORS.blueText, fontWeight: '700', fontSize: 14 },
});
