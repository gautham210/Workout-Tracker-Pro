import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SessionSyncState } from '../lib/db';

const MAP: Record<SessionSyncState, { label: string; bg: string; fg: string }> = {
  local_only: { label: 'Not synced yet', bg: '#eaf4ff', fg: '#12507f' },
  syncing: { label: 'Syncing', bg: '#eaf4ff', fg: '#12507f' },
  synced: { label: 'Synced', bg: '#eaf8ef', fg: '#1b6b3a' },
  retrying: { label: 'Retrying sync', bg: '#fff7e6', fg: '#7a5200' },
  failed: { label: 'Sync failed', bg: '#fff0f0', fg: '#9b1c1c' },
};

/** Per-workout sync status derived from the local outbox (never assumed). */
export default function MetricSyncBadge({ state }: { state: SessionSyncState }) {
  const m = MAP[state];
  return (
    <View accessible accessibilityLabel={`Sync status: ${m.label}`} style={[styles.badge, { backgroundColor: m.bg }]}>
      <Text style={[styles.text, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  text: { fontSize: 11, fontWeight: '800' },
});
