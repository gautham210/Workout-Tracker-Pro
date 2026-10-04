import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Pause, Play, Timer } from 'lucide-react-native';

export type RestTrigger = { id: number; seconds: number; label?: string } | null;
export const DEFAULT_REST_SECONDS = 90;

/**
 * Rest timer. Timestamp based (survives backgrounding) and owns its own 1s tick, so the parent screen never
 * re-renders while counting down. A new `trigger` object (new id) restarts it.
 */
function WorkoutTimer({ trigger }: { trigger: RestTrigger }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeftMs, setPausedLeftMs] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const lastId = useRef(0);
  const active = endsAt != null || pausedLeftMs != null;

  useEffect(() => {
    if (!trigger || trigger.id === lastId.current) return;
    lastId.current = trigger.id;
    setLabel(trigger.label ?? '');
    setPausedLeftMs(null); setFinished(false);
    setNow(Date.now());
    setEndsAt(Date.now() + Math.max(1, trigger.seconds) * 1000);
  }, [trigger]);

  const tick = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    if (endsAt == null) return;
    const interval = setInterval(tick, 500);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick(); });
    return () => { clearInterval(interval); sub.remove(); };
  }, [endsAt, tick]);

  const leftMs = pausedLeftMs ?? (endsAt != null ? Math.max(0, endsAt - now) : 0);
  useEffect(() => {
    if (endsAt != null && endsAt - now <= 0) {
      setEndsAt(null); setFinished(true);
      Vibration.vibrate([0, 400, 150, 400]);
    }
  }, [endsAt, now]);
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => setFinished(false), 4000);
    return () => clearTimeout(t);
  }, [finished]);

  const skip = useCallback(() => { setEndsAt(null); setPausedLeftMs(null); setFinished(false); }, []);
  const addThirty = useCallback(() => {
    if (pausedLeftMs != null) setPausedLeftMs(pausedLeftMs + 30000);
    else if (endsAt != null) setEndsAt(endsAt + 30000);
    else { setFinished(false); setNow(Date.now()); setEndsAt(Date.now() + 30000); }
  }, [pausedLeftMs, endsAt]);
  const togglePause = useCallback(() => {
    if (pausedLeftMs != null) { setEndsAt(Date.now() + pausedLeftMs); setPausedLeftMs(null); setNow(Date.now()); }
    else if (endsAt != null) { setPausedLeftMs(Math.max(0, endsAt - Date.now())); setEndsAt(null); }
  }, [pausedLeftMs, endsAt]);

  if (!active && !finished) return null;
  const secs = Math.ceil(leftMs / 1000);
  const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Timer color="#007aff" size={20} />
      <View style={{ flex: 1 }}>
        <Text style={styles.time} accessibilityLabel={finished ? 'Rest finished' : `Rest ${secs} seconds remaining`}>{finished ? 'Rest over' : text}</Text>
        {label ? <Text style={styles.label} numberOfLines={1}>{pausedLeftMs != null ? `Paused · ${label}` : label}</Text> : null}
      </View>
      {!finished ? (
        <>
          <TouchableOpacity onPress={togglePause} hitSlop={8} style={styles.btn} accessibilityRole="button" accessibilityLabel={pausedLeftMs != null ? 'Resume rest timer' : 'Pause rest timer'}>
            {pausedLeftMs != null ? <Play size={16} color="#24324a" /> : <Pause size={16} color="#24324a" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={addThirty} hitSlop={8} style={styles.btn} accessibilityRole="button" accessibilityLabel="Add 30 seconds"><Text style={styles.btnText}>+30s</Text></TouchableOpacity>
        </>
      ) : null}
      <TouchableOpacity onPress={skip} hitSlop={8} style={styles.btn} accessibilityRole="button" accessibilityLabel={finished ? 'Dismiss' : 'Skip rest'}>
        <Text style={styles.btnText}>{finished ? 'Dismiss' : 'Skip'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12, marginHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: '#d6e6f7', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  time: { color: '#172033', fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  label: { color: '#68758a', fontSize: 11, marginTop: 1 },
  btn: { minWidth: 44, minHeight: 40, borderRadius: 12, backgroundColor: '#f0f3f8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  btnText: { color: '#24324a', fontSize: 13, fontWeight: '800' },
});

export default memo(WorkoutTimer);
