import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, StyleProp, ViewStyle } from 'react-native';

export type StatusBannerKind = 'info' | 'error' | 'offline' | 'success';

export type StatusBannerProps = {
  kind?: StatusBannerKind;
  message: string;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

const PALETTE: Record<StatusBannerKind, { bg: string; border: string; text: string }> = {
  info: { bg: '#EAF4FF', border: '#BCDDFB', text: '#12507F' },
  error: { bg: '#FFF0F0', border: '#F5C2C2', text: '#9B1C1C' },
  offline: { bg: '#FFF7E6', border: '#F2D9A0', text: '#7A5200' },
  success: { bg: '#EAF8EF', border: '#BFE5CB', text: '#1B6B3A' },
};

export default function StatusBanner({ kind = 'info', message, title, actionLabel, onAction, style }: StatusBannerProps) {
  const colors = PALETTE[kind];
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }, style]}
    >
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
        <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.action}>
          <Text style={[styles.actionText, { color: colors.text }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, gap: 12 },
  body: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  message: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  action: { paddingVertical: 6, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '700' },
});
