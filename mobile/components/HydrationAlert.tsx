import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Droplet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeStorage } from '../lib/supabase';

interface HydrationAlertProps {
  /** Kept for call-site compatibility; reminders are time-based only. */
  completedSetsCount?: number;
  onDrinkLogged?: (oz: number) => void;
}

const SHOW_MS = 6000;

/**
 * Time-based hydration reminder. The interval is chosen in Settings > Workout reminders
 * (storage keys wtp_hydro_type = 'time' | 'disabled', wtp_hydro_interval = minutes). Off by default.
 */
export default function HydrationAlert(_props: HydrationAlertProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    (async () => {
      const type = await safeStorage.getItem('wtp_hydro_type');
      const minutes = Number(await safeStorage.getItem('wtp_hydro_interval'));
      if (cancelled || type !== 'time' || !Number.isFinite(minutes) || minutes < 1) return;
      interval = setInterval(() => {
        setVisible(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setVisible(false), SHOW_MS);
      }, minutes * 60_000);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" pointerEvents="none" style={[styles.toast, { top: insets.top + 12 }]}>
      <Droplet color="#fff" size={16} />
      <Text style={styles.text}>Time to hydrate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0b5fc4', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, elevation: 5, zIndex: 9999 },
  text: { color: '#fff', fontWeight: '700' },
});
