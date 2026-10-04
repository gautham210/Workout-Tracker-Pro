import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import StatusBanner from './StatusBanner';
import { COLORS } from '../lib/analyticsHooks';
import { buildAnalysisJson, Confidence, MEAL_TYPES, MealType, NewFoodEntry, parseRange, ScanAnalysis, ScanItem } from '../lib/nutritionData';

type Props = {
  visible: boolean;
  /** null = manual entry. Nothing is counted toward totals until onSave succeeds. */
  analysis: ScanAnalysis | null;
  imageUri?: string | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (entry: NewFoodEntry) => void;
};

const defaultMealType = (): MealType => {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
};
const LIMITS = { calories: 10000, protein_g: 1000, carbs_g: 2000, fat_g: 1000, fiber_g: 200 };
const FIELDS: { key: keyof typeof LIMITS; label: string; unit: string; range?: 'caloriesRange' | 'proteinRange' | 'carbsRange' | 'fatRange' }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', range: 'caloriesRange' }, { key: 'protein_g', label: 'Protein', unit: 'g', range: 'proteinRange' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', range: 'carbsRange' }, { key: 'fat_g', label: 'Fat', unit: 'g', range: 'fatRange' }, { key: 'fiber_g', label: 'Fiber', unit: 'g' },
];
const CONFIDENCE_COLORS: Record<Confidence, { bg: string; fg: string }> = {
  High: { bg: COLORS.greenSoft, fg: '#14633f' }, Medium: { bg: COLORS.amberSoft, fg: COLORS.amber }, Low: { bg: COLORS.redSoft, fg: COLORS.red },
};

export default function MealReviewSheet({ visible, analysis, imageUri, saving, error, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [values, setValues] = useState<Record<keyof typeof LIMITS, string>>({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' });
  const [items, setItems] = useState<ScanItem[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMealType(defaultMealType()); setLocalError(null);
    if (analysis) {
      const mid = (r: string) => String(parseRange(r)?.mid ?? '');
      setName((analysis.detectedFoods.join(', ') || 'Meal estimate').slice(0, 200));
      setValues({ calories: mid(analysis.caloriesRange), protein_g: mid(analysis.proteinRange), carbs_g: mid(analysis.carbsRange), fat_g: mid(analysis.fatRange), fiber_g: '' });
      setItems(analysis.items);
    } else {
      setName(''); setValues({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' }); setItems([]);
    }
  }, [visible, analysis]);

  const submit = () => {
    if (saving) return;
    const parsed: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const raw = values[f.key].trim().replace(',', '.');
      if (!raw) { parsed[f.key] = f.key === 'fiber_g' ? null : f.key === 'calories' ? NaN : 0; continue; }
      parsed[f.key] = Number(raw);
    }
    if (!name.trim()) return setLocalError('Give the meal a name.');
    for (const f of FIELDS) {
      const v = parsed[f.key];
      if (v === null) continue;
      if (!Number.isFinite(v) || v < 0 || v > LIMITS[f.key]) return setLocalError(`${f.label} must be a number between 0 and ${LIMITS[f.key]}.`);
    }
    setLocalError(null);
    const round = (v: number) => Math.round(v * 10) / 10;
    onSave({
      name: name.trim(), meal_type: mealType, calories: round(parsed.calories as number), protein_g: round(parsed.protein_g as number), carbs_g: round(parsed.carbs_g as number),
      fat_g: round(parsed.fat_g as number), fiber_g: parsed.fiber_g === null ? null : round(parsed.fiber_g as number),
      source: analysis ? 'scan' : 'manual', confidence: analysis?.confidence ?? null, assumptions: analysis?.assumptions ?? [],
      analysis: analysis ? buildAnalysisJson(analysis, items) : null,
    });
  };

  const shownError = localError ?? error;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={saving ? undefined : onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={styles.title}>{analysis ? 'Review estimate' : 'Add meal'}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close without saving" hitSlop={12} disabled={saving} onPress={onClose} style={styles.close}><X color={COLORS.ink} size={22} /></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
            {analysis ? (
              <>
                {imageUri ? <Image source={{ uri: imageUri }} style={styles.photo} accessibilityLabel="The meal photo you selected" /> : null}
                <View style={styles.row}>
                  <Text style={styles.kicker}>PHOTO ESTIMATE</Text>
                  <Text style={[styles.badge, { backgroundColor: CONFIDENCE_COLORS[analysis.confidence].bg, color: CONFIDENCE_COLORS[analysis.confidence].fg }]}>{analysis.confidence} confidence</Text>
                </View>
                <Text style={styles.note}>This is an estimate from a photo, not a measurement. Check the portions and correct the values below. Nothing is added to your totals until you save.</Text>
                {analysis.confidence === 'Low' ? <StatusBanner kind="offline" title="Low confidence" message="The scanner was not sure about this meal. Please review every value, or log it manually." style={{ marginBottom: 10 }} /> : null}
                {items.map((item, i) => (
                  <View key={`${item.name}-${i}`} style={styles.item}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.label}>Portion (edit if wrong)</Text>
                    <TextInput accessibilityLabel={`Portion for ${item.name}`} style={styles.input} value={item.estimatedPortion} maxLength={120}
                      onChangeText={(t) => setItems((cur) => cur.map((x, idx) => (idx === i ? { ...x, estimatedPortion: t } : x)))} placeholder="e.g. 1 cup" placeholderTextColor="#6b778b" />
                    <Text style={styles.range}>Est. {item.caloriesRange || '?'} kcal · P {item.proteinRange || '?'} g · C {item.carbsRange || '?'} g · F {item.fatRange || '?'} g</Text>
                  </View>
                ))}
                <View style={styles.rangeBox}>
                  <Text style={styles.label}>Whole-meal estimated range</Text>
                  <Text style={styles.rangeText}>{analysis.caloriesRange} kcal · protein {analysis.proteinRange} g · carbs {analysis.carbsRange} g · fat {analysis.fatRange} g</Text>
                  <Text style={styles.note}>The fields below start at the middle of each range.</Text>
                </View>
                {analysis.assumptions.length ? <View style={{ marginTop: 10 }}><Text style={styles.label}>Assumptions</Text>{analysis.assumptions.map((a, i) => <Text key={i} style={styles.note}>• {a}</Text>)}</View> : null}
                {analysis.followUpQuestion ? <Text style={[styles.note, { marginTop: 8 }]}>To refine: {analysis.followUpQuestion}</Text> : null}
              </>
            ) : null}

            <Text style={[styles.label, { marginTop: 14 }]}>Meal name</Text>
            <TextInput accessibilityLabel="Meal name" style={styles.input} value={name} onChangeText={setName} maxLength={200} placeholder="e.g. Greek yogurt bowl" placeholderTextColor="#6b778b" />

            <Text style={[styles.label, { marginTop: 12 }]}>Meal type</Text>
            <View style={styles.chips}>
              {MEAL_TYPES.map((t) => (
                <TouchableOpacity key={t} accessibilityRole="radio" accessibilityState={{ selected: t === mealType }} onPress={() => setMealType(t)} style={[styles.chip, t === mealType && styles.chipActive]}>
                  <Text style={[styles.chipText, t === mealType && { color: '#fff' }]}>{t[0].toUpperCase() + t.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.grid}>
              {FIELDS.map((f) => (
                <View key={f.key} style={styles.cell}>
                  <Text style={styles.label}>{f.label} ({f.unit}){f.key === 'fiber_g' ? ' optional' : ''}</Text>
                  <TextInput accessibilityLabel={`${f.label} in ${f.unit}`} style={styles.input} keyboardType="decimal-pad" value={values[f.key]} maxLength={7}
                    onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))} placeholder={f.key === 'fiber_g' ? '—' : '0'} placeholderTextColor="#6b778b" />
                </View>
              ))}
            </View>
            {shownError ? <StatusBanner kind="error" message={shownError} style={{ marginTop: 12 }} /> : null}
          </ScrollView>

          <SafeAreaView edges={['bottom']} style={styles.footer}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={analysis ? 'Save corrected meal' : 'Save meal'} disabled={saving} onPress={submit} style={[styles.save, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{analysis ? 'Save corrected meal' : 'Save meal'}</Text>}
            </TouchableOpacity>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  title: { color: COLORS.ink, fontSize: 22, fontWeight: '800' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  photo: { width: '100%', height: 170, borderRadius: 18, marginBottom: 12, backgroundColor: '#e3e9f2' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  badge: { fontSize: 12, fontWeight: '800', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  item: { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginTop: 10, borderWidth: 1, borderColor: COLORS.line },
  itemName: { color: COLORS.ink, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  range: { color: COLORS.body, fontSize: 12, marginTop: 6 },
  rangeBox: { backgroundColor: COLORS.blueSoft, borderRadius: 16, padding: 12, marginTop: 12 },
  rangeText: { color: '#12507f', fontSize: 14, fontWeight: '700', marginTop: 2 },
  label: { color: COLORS.body, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#c9d2e0', backgroundColor: '#fff', paddingHorizontal: 12, color: COLORS.ink, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#c9d2e0', justifyContent: 'center', backgroundColor: '#fff' },
  chipActive: { backgroundColor: COLORS.blueText, borderColor: COLORS.blueText },
  chipText: { color: COLORS.body, fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  cell: { width: '47%', flexGrow: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.line },
  save: { minHeight: 52, borderRadius: 16, backgroundColor: COLORS.blueText, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
