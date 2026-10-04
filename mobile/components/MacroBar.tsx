import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../lib/analyticsHooks';

/** Progress of a nutrient against its target. Without a target it shows the total only (no fabricated goal). */
export default function MacroBar({ label, value, target, unit = 'g', color = COLORS.blue }: {
  label: string; value: number; target?: number | null; unit?: string; color?: string;
}) {
  const hasTarget = typeof target === 'number' && target > 0;
  const pct = hasTarget ? Math.min(100, Math.round((value / target!) * 100)) : 0;
  const over = hasTarget && value > target!;
  const detail = hasTarget ? `${Math.round(value)} / ${Math.round(target!)} ${unit}` : `${Math.round(value)} ${unit} · no target set`;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${detail}${over ? ', over target' : ''}`}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, over && { color: COLORS.amber }]}>{detail}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: over ? '#d98a00' : color }]} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  label: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  value: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(28,48,82,0.08)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
