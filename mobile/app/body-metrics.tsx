import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Save } from 'lucide-react-native';
import ChartBars from '../components/ChartBars';
import MetricHeader from '../components/MetricHeader';
import MetricSkeleton from '../components/MetricSkeleton';
import StatusBanner from '../components/StatusBanner';
import { useAuth } from '../lib/AuthContext';
import { COLORS } from '../lib/analyticsHooks';
import { useScreenInset } from '../lib/layout';
import {
  ACTIVITY_OPTIONS, buildMetricsPayload, calculateBodyMetrics, formToInput, GOAL_OPTIONS, MetricsForm, roundMetric, SEX_OPTIONS, validateMetricsForm,
} from '../lib/metrics';
import { isOfflineError } from '../lib/api';
import { BodyLog, describeDataError, fetchBodyLogs, fetchProfileMetrics, formFromProfile, saveAthleteMetrics } from '../lib/metricsData';

const NUMERIC_FIELDS: { field: keyof MetricsForm; label: string; unit: string }[] = [
  { field: 'weight_kg', label: 'Weight', unit: 'kg' }, { field: 'height_cm', label: 'Height', unit: 'cm' }, { field: 'age', label: 'Age', unit: 'years' },
  { field: 'waist_cm', label: 'Waist', unit: 'cm' }, { field: 'neck_cm', label: 'Neck', unit: 'cm' }, { field: 'chest_cm', label: 'Chest', unit: 'cm' }, { field: 'hips_cm', label: 'Hips', unit: 'cm' },
];

export default function BodyMetricsScreen() {
  const { user } = useAuth();
  const inset = useScreenInset();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [logs, setLogs] = useState<BodyLog[]>([]);
  const [form, setForm] = useState<MetricsForm | null>(null);
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof MetricsForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setState('loading'); setLoadError('');
    try {
      const [profile, history] = await Promise.all([fetchProfileMetrics(user.id), fetchBodyLogs(user.id)]);
      setLogs(history);
      const latestWithWeight = history.find((l) => l.weight_kg !== null) ?? null;
      setForm((current) => current ?? formFromProfile(profile, latestWithWeight));
      setPrefilledFrom(latestWithWeight?.logged_at ?? null);
      setState('ready');
    } catch (e) { setLoadError(describeDataError(e, 'your body metrics')); setState('error'); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => (form ? calculateBodyMetrics(formToInput(form)) : null), [form]);
  const update = (field: keyof MetricsForm, value: string) => { setSaved(false); setForm((f) => (f ? { ...f, [field]: value } : f)); setErrors((e) => ({ ...e, [field]: undefined })); };

  const save = async () => {
    if (!form || !metrics || saving) return;
    const found = validateMetricsForm(form);
    setErrors(found); setSaveError(''); setSaved(false); setSaveFailed(false);
    if (Object.keys(found).length) { setSaveError('Fix the highlighted fields and try again.'); return; }
    setSaving(true);
    try {
      await saveAthleteMetrics(buildMetricsPayload(form, metrics));
      setSaved(true);
      setLogs(await fetchBodyLogs(user!.id));
    } catch (e) {
      setSaveFailed(true);
      setSaveError(isOfflineError(e) ? 'You appear to be offline. Nothing was saved. Connect and tap Save again.' : describeDataError(e, 'body metrics', 'saved'));
    } finally { setSaving(false); }
  };

  const weightLogs = logs.filter((l) => l.weight_kg !== null).slice(0, 12).reverse();
  const lo = weightLogs.length ? Math.min(...weightLogs.map((l) => l.weight_kg!)) : 0;
  const hi = weightLogs.length ? Math.max(...weightLogs.map((l) => l.weight_kg!)) : 0;
  const floor = lo - Math.max(1, (hi - lo) * 0.6);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MetricHeader title="Body metrics" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          <Text style={styles.lead}>Estimates use standard formulas (Mifflin–St Jeor, US Navy). They are starting points, not medical measurements.</Text>
          {state === 'loading' ? <MetricSkeleton rows={3} height={90} /> : null}
          {state === 'error' ? <StatusBanner kind="error" title="Could not load your metrics" message={loadError} actionLabel="Retry" onAction={load} /> : null}

          {state === 'ready' && form && metrics ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Weight history</Text>
                {weightLogs.length === 0 ? <Text style={styles.muted}>No weights saved yet. Your first save below creates the baseline.</Text> : (
                  <>
                    <Text style={styles.big}>{weightLogs[weightLogs.length - 1].weight_kg!.toFixed(1)} kg</Text>
                    <Text style={styles.muted}>Latest entry {weightLogs[weightLogs.length - 1].logged_at}</Text>
                    {weightLogs.length > 1 ? <View style={{ marginTop: 8 }}><ChartBars height={90} color={COLORS.green} summaryLabel="Body weight in kilograms"
                      data={weightLogs.map((l) => ({ label: l.logged_at.slice(5).replace('-', '/'), value: l.weight_kg! - floor, shown: l.weight_kg!.toFixed(1) }))} /></View> : null}
                  </>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Your measurements</Text>
                {prefilledFrom ? <Text style={styles.muted}>Prefilled from your saved profile and your entry on {prefilledFrom}. Update what changed; saving records these values for the date below.</Text> : null}
                <View style={styles.grid}>
                  {NUMERIC_FIELDS.map(({ field, label, unit }) => (
                    <View key={field} style={styles.cell}>
                      <Text style={styles.label}>{label} ({unit})</Text>
                      <TextInput
                        accessibilityLabel={`${label} in ${unit}`}
                        style={[styles.input, errors[field] ? styles.inputError : null]}
                        value={form[field] as string}
                        onChangeText={(t) => update(field, t)}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor="#6b778b"
                        maxLength={6}
                      />
                      {errors[field] ? <Text style={styles.err}>{errors[field]}</Text> : null}
                    </View>
                  ))}
                </View>
                <Text style={styles.label}>Date</Text>
                <TextInput accessibilityLabel="Date, year-month-day" style={[styles.input, errors.logged_at ? styles.inputError : null]} value={form.logged_at} onChangeText={(t) => update('logged_at', t)} placeholder="YYYY-MM-DD" placeholderTextColor="#6b778b" maxLength={10} autoCorrect={false} />
                {errors.logged_at ? <Text style={styles.err}>{errors.logged_at}</Text> : null}

                <Chips label="Sex" value={form.sex} options={SEX_OPTIONS} onChange={(v) => update('sex', v)} />
                {form.sex === 'unspecified' ? <Text style={styles.muted}>Calorie (BMR) and body-fat estimates need Female or Male for the formulas.</Text> : null}
                <Chips label="Activity" value={form.activity_level} options={ACTIVITY_OPTIONS} onChange={(v) => update('activity_level', v)} />
                <Chips label="Goal" value={form.training_goal} options={GOAL_OPTIONS} onChange={(v) => update('training_goal', v)} />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Estimated outputs</Text>
                <View style={styles.grid}>
                  {[
                    ['BMI', metrics.bmi, '', 1], ['BMR', metrics.bmr, ' kcal', 0], ['Maintenance', metrics.tdee, ' kcal', 0], ['Target calories', metrics.targetCalories, ' kcal', 0],
                    ['Protein', metrics.proteinG, ' g', 0], ['Carbs', metrics.carbsG, ' g', 0], ['Fat', metrics.fatG, ' g', 0],
                    ['Body fat (Navy)', metrics.bodyFatPercentage, ' %', 1], ['Lean mass', metrics.leanMassKg, ' kg', 1], ['Fat mass', metrics.fatMassKg, ' kg', 1],
                  ].map(([label, value, unit, places]) => {
                    const rounded = roundMetric(value as number | null, places as number);
                    return (
                      <View key={label as string} style={styles.out}>
                        <Text style={styles.label}>{label as string}</Text>
                        <Text style={styles.outValue}>{rounded === null ? '—' : `${rounded}${unit}`}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.muted}>{metrics.assumptions[0]} {metrics.assumptions[metrics.assumptions.length - 1]}</Text>
                <Text style={styles.muted}>Saving also sets your daily nutrition targets (including fiber and water) from these estimates.</Text>
              </View>

              {logs.length ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Recent entries</Text>
                  {logs.slice(0, 8).map((l) => (
                    <View key={l.id} style={styles.logRow}>
                      <Text style={styles.logDate}>{l.logged_at}</Text>
                      <Text style={styles.logVal}>{l.weight_kg !== null ? `${l.weight_kg.toFixed(1)} kg` : 'Measurements only'}{l.waist_cm ? ` · waist ${l.waist_cm} cm` : ''}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        {state === 'ready' ? (
          <View style={[styles.footer, { paddingBottom: Math.max(inset.bottom, 12) }]}>
            {saveError ? <StatusBanner kind={/offline/i.test(saveError) ? 'offline' : 'error'} message={saveError} style={{ marginBottom: 8 }} /> : null}
            {saved ? <StatusBanner kind="success" message="Saved to your account. Targets updated." style={{ marginBottom: 8 }} /> : null}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save metrics and targets" disabled={saving} onPress={save} style={[styles.save, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <><Save color="#fff" size={18} /><Text style={styles.saveText}>{saveFailed ? 'Retry save' : 'Save metrics and targets'}</Text></>}
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <TouchableOpacity key={o.value} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={`${label}: ${o.label}`} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  lead: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.line },
  cardTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  muted: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  big: { color: COLORS.ink, fontSize: 28, fontWeight: '800', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  cell: { width: '47%', flexGrow: 1 },
  label: { color: COLORS.body, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#c9d2e0', backgroundColor: '#fafbfe', paddingHorizontal: 12, color: COLORS.ink, fontSize: 16 },
  inputError: { borderColor: COLORS.red, backgroundColor: COLORS.redSoft },
  err: { color: COLORS.red, fontSize: 11, marginTop: 3, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#c9d2e0', justifyContent: 'center', backgroundColor: '#fff' },
  chipActive: { backgroundColor: COLORS.blueText, borderColor: COLORS.blueText },
  chipText: { color: COLORS.body, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  out: { width: '47%', flexGrow: 1, backgroundColor: '#f3f6fb', borderRadius: 14, padding: 12 },
  outValue: { color: COLORS.ink, fontSize: 18, fontWeight: '800' },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.line },
  logDate: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  logVal: { color: COLORS.ink, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.line },
  save: { minHeight: 52, borderRadius: 16, backgroundColor: COLORS.blueText, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
