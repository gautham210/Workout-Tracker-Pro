import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS } from '../lib/analyticsHooks';

/** Back + title header for screens pushed on top of the tabs. */
export default function MetricHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} style={styles.back}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
        <ArrowLeft color={COLORS.ink} size={22} />
      </TouchableOpacity>
      <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, minHeight: 56 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: COLORS.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  right: { width: 44, alignItems: 'center', justifyContent: 'center' },
});
