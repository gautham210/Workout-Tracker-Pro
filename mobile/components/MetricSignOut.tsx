import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useAuth } from '../lib/AuthContext';
import { COLORS } from '../lib/analyticsHooks';

/** Sign-out with the unsynced-workout safeguard: never silently discards data that has not reached the server. */
export default function MetricSignOut() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = async (discardUnsynced: boolean) => {
    setBusy(true);
    try {
      const result = await signOut(discardUnsynced ? { discardUnsynced: true } : undefined);
      if (!result.ok) {
        Alert.alert(
          'Some workouts have not synced',
          `${result.unsynced} workout${result.unsynced === 1 ? ' is' : 's are'} still only on this device and could not be uploaded right now. Signing out and discarding will permanently delete ${result.unsynced === 1 ? 'it' : 'them'}.`,
          [
            { text: 'Stay signed in', style: 'cancel' },
            { text: 'Sign out and discard', style: 'destructive', onPress: () => { run(true); } },
          ],
        );
      }
    } catch (e) {
      Alert.alert('Sign out failed', e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  };

  const confirm = () => Alert.alert('Sign out?', 'Your unsynced workouts will be uploaded first if possible.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { run(false); } },
  ]);

  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign out" disabled={busy} onPress={confirm} style={[styles.btn, busy && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={COLORS.red} /> : <><LogOut color={COLORS.red} size={18} /><Text style={styles.text}>Sign out</Text></>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#f0c4c0', backgroundColor: COLORS.redSoft },
  text: { color: COLORS.red, fontSize: 15, fontWeight: '800' },
});
