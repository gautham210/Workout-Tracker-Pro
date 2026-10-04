import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, StyleProp, ViewStyle } from 'react-native';
import { useAuth } from '../lib/AuthContext';
import { processOutbox, SyncState, SYNC_LABELS } from '../lib/sync';
import { useSyncState } from '../lib/useSyncState';

export type SyncPillProps = {
  /** Override the live state (e.g. a per-session state); defaults to the global sync state. */
  state?: SyncState;
  style?: StyleProp<ViewStyle>;
};

const COLORS: Record<SyncState, { bg: string; dot: string; text: string }> = {
  idle: { bg: '#F1F4F9', dot: '#9AA5B5', text: '#52607A' },
  local_only: { bg: '#EAF4FF', dot: '#007AFF', text: '#12507F' },
  syncing: { bg: '#EAF4FF', dot: '#007AFF', text: '#12507F' },
  synced: { bg: '#EAF8EF', dot: '#22A559', text: '#1B6B3A' },
  retrying: { bg: '#FFF7E6', dot: '#E39B00', text: '#7A5200' },
  failed: { bg: '#FFF0F0', dot: '#D93025', text: '#9B1C1C' },
  offline: { bg: '#FFF7E6', dot: '#E39B00', text: '#7A5200' },
};

/** Compact sync indicator. Tapping retries when the state is failed, retrying, or offline. */
export default function SyncPill({ state, style }: SyncPillProps) {
  const { user } = useAuth();
  const globalState = useSyncState();
  const current = state ?? globalState;
  if (current === 'idle') return null;
  const colors = COLORS[current];
  const label = SYNC_LABELS[current];
  const retryable = (current === 'failed' || current === 'retrying' || current === 'offline') && !!user;
  const content = (
    <>
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {retryable ? <Text style={[styles.retry, { color: colors.text }]}>Retry</Text> : null}
    </>
  );
  if (!retryable) {
    return <View accessibilityLabel={label} style={[styles.pill, { backgroundColor: colors.bg }, style]}>{content}</View>;
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to retry sync`}
      onPress={() => { if (user) processOutbox(user.id, true).catch(() => undefined); }}
      style={[styles.pill, { backgroundColor: colors.bg }, style]}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, minHeight: 32, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '700' },
  retry: { fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
});
