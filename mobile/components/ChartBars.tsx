import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../lib/analyticsHooks';

export type ChartDatum = { label: string; value: number; shown?: string };

/** Plain-View bar chart. Heights are relative to the largest value; zero values render as a thin baseline tick. */
export default function ChartBars({ data, height = 120, color = COLORS.blue, summaryLabel, valueFormatter = (v: number) => String(Math.round(v)) }: {
  data: ChartDatum[]; height?: number; color?: string; summaryLabel: string; valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const summary = `${summaryLabel}. ${data.map((d) => `${d.label}: ${d.shown ?? valueFormatter(d.value)}`).join(', ')}.`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={[styles.plot, { height }]}>
        {data.map((d, i) => {
          const h = max > 0 && d.value > 0 ? Math.max(4, (d.value / max) * (height - 18)) : 2;
          return (
            <View key={`${d.label}-${i}`} style={styles.col}>
              {d.value > 0 ? <Text style={styles.value} numberOfLines={1}>{d.shown ?? valueFormatter(d.value)}</Text> : <Text style={styles.value}> </Text>}
              <View style={[styles.bar, { height: h, backgroundColor: d.value > 0 ? color : COLORS.line }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => <Text key={`${d.label}-${i}`} style={styles.label} numberOfLines={1}>{d.label}</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '70%', borderTopLeftRadius: 6, borderTopRightRadius: 6, minWidth: 6 },
  value: { fontSize: 9, color: COLORS.muted, fontWeight: '700', marginBottom: 2 },
  labels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  label: { flex: 1, textAlign: 'center', fontSize: 10, color: COLORS.muted, fontWeight: '600' },
});
