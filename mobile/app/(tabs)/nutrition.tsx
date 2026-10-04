import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ChevronLeft, ChevronRight, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react-native';
import GlassCard from '../../components/GlassCard';
import MacroBar from '../../components/MacroBar';
import MealReviewSheet from '../../components/MealReviewSheet';
import MetricSkeleton from '../../components/MetricSkeleton';
import PlanChat from '../../components/PlanChat';
import ProgressRing from '../../components/ProgressRing';
import StatusBanner from '../../components/StatusBanner';
import { scanFoodImage } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';
import { COLORS } from '../../lib/analyticsHooks';
import { useTabBarInset } from '../../lib/layout';
import { describeDataError, fetchTargets, TargetsRow } from '../../lib/metricsData';
import {
  deleteFoodEntry, describeScanError, FoodEntry, fetchFoodEntriesForDay, insertFoodEntry, MAX_IMAGE_BYTES, NewFoodEntry, readScanAnalysis, ScanAnalysis, sumEntries,
} from '../../lib/nutritionData';

type Section = 'journal' | 'chat';
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const sniffMime = (base64: string): string | null =>
  base64.startsWith('/9j/') ? 'image/jpeg' : base64.startsWith('iVBOR') ? 'image/png' : base64.startsWith('UklGR') ? 'image/webp' : null;

export default function NutritionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const inset = useTabBarInset();
  const params = useLocalSearchParams<{ action?: string }>();
  const [section, setSection] = useState<Section>('journal');
  const [chatOpened, setChatOpened] = useState(false);
  const [day, setDay] = useState(() => new Date());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [targets, setTargets] = useState<TargetsRow | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [analysis, setAnalysis] = useState<ScanAnalysis | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<{ message: string; retry: boolean } | null>(null);
  const lastSource = useRef<'camera' | 'library'>('camera');
  const dayRef = useRef(day); dayRef.current = day;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [rows, t] = await Promise.all([fetchFoodEntriesForDay(user.id, dayRef.current), fetchTargets(user.id)]);
      setEntries(rows); setTargets(t); setState('ready'); setError('');
    } catch (e) { setError(describeDataError(e, 'your meal journal')); setState('error'); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setState((s) => (s === 'ready' ? s : 'loading')); load(); }, [day, load]);

  const totals = useMemo(() => sumEntries(entries), [entries]);
  const isToday = sameDay(day, new Date());
  const shift = (delta: number) => setDay((d) => { const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta); return n > new Date() ? d : n; });

  const permissionHint = (what: string) => Alert.alert(`${what} access is off`, `Allow ${what.toLowerCase()} access for Workout Tracker Pro in Settings to scan meals. You can still log meals manually.`, [
    { text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => undefined); } },
  ]);

  const runScan = useCallback(async (source: 'camera' | 'library') => {
    if (scanning) return;
    lastSource.current = source; setScanNotice(null);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { permissionHint('Camera'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.4, base64: true, allowsEditing: false, exif: false };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) { setScanNotice({ message: 'That photo could not be read. Try another one.', retry: false }); return; }
      const mime = sniffMime(asset.base64);
      if (!mime) { setScanNotice({ message: 'That image format is not supported. Use a JPEG, PNG, or WebP photo.', retry: false }); return; }
      const bytes = Math.floor(asset.base64.length * 0.75);
      if (bytes > MAX_IMAGE_BYTES) { setScanNotice({ message: `That photo is ${(bytes / 1_000_000).toFixed(1)} MB; the limit is 3.5 MB. Take a new photo from a little further away or pick a smaller image.`, retry: false }); return; }
      setScanning(true);
      setImageUri(asset.uri);
      try {
        const data = await scanFoodImage(`data:${mime};base64,${asset.base64}`);
        const parsed = readScanAnalysis(data);
        if (!parsed) { setScanNotice({ message: 'The scanner returned an estimate we could not read. Try a clearer photo or log the meal manually.', retry: true }); return; }
        setAnalysis(parsed); setSaveError(null); setSheetOpen(true);
      } catch (e) {
        const d = describeScanError(e);
        setScanNotice({ message: d.message, retry: d.retryable });
      } finally { setScanning(false); }
    } catch (e) {
      const message = String((e as Error)?.message ?? '');
      if (/permission|denied|not authorized/i.test(message)) permissionHint(source === 'camera' ? 'Camera' : 'Photo library');
      else setScanNotice({ message: 'The photo picker could not be opened. Please try again.', retry: false });
    }
  }, [scanning]);

  const chooseSource = useCallback(() => {
    Alert.alert('Scan a meal', 'Photo results are estimates you can edit before saving.', [
      { text: 'Take photo', onPress: () => { runScan('camera'); } },
      { text: 'Choose from library', onPress: () => { runScan('library'); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [runScan]);

  const openManual = () => { setAnalysis(null); setImageUri(null); setSaveError(null); setSheetOpen(true); };

  useEffect(() => {
    if (!params.action) return;
    setSection('journal');
    if (params.action === 'scan') chooseSource();
    if (params.action === 'manual') openManual();
    router.setParams({ action: undefined });
  }, [params.action]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (entry: NewFoodEntry) => {
    if (!user || saving) return;
    setSaving(true); setSaveError(null);
    try {
      const when = isToday ? new Date() : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0);
      await insertFoodEntry(user.id, entry, when);
      setSheetOpen(false); setAnalysis(null); setImageUri(null);
      await load();
    } catch (e) {
      setSaveError(`Not saved. ${describeDataError(e, 'this meal', 'saved')}`);
    } finally { setSaving(false); }
  };

  const confirmDelete = (entry: FoodEntry) => {
    Alert.alert('Delete this meal?', `${entry.name} (${Math.round(entry.calories)} kcal) will be removed from your journal.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteFoodEntry(user!.id, entry.id); await load(); } catch (e) { Alert.alert('Could not delete', describeDataError(e, 'this meal', 'saved').replace('saved', 'deleted')); }
      } },
    ]);
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const switchSection = (s: Section) => { setSection(s); if (s === 'chat') setChatOpened(true); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Nutrition</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Body metrics and targets" hitSlop={8} onPress={() => router.push('/body-metrics')} style={styles.headLink}>
          <Text style={styles.link}>Targets</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.segment} accessibilityRole="tablist">
        {(['journal', 'chat'] as Section[]).map((s) => (
          <TouchableOpacity key={s} accessibilityRole="tab" accessibilityState={{ selected: section === s }} onPress={() => switchSection(s)} style={[styles.segBtn, section === s && styles.segActive]}>
            <Text style={[styles.segText, section === s && { color: '#fff' }]}>{s === 'journal' ? 'Journal' : 'Nutritionist'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1, display: section === 'journal' ? 'flex' : 'none' }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: inset.contentBottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.blue} />}>
          <View style={styles.dayNav}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={10} onPress={() => shift(-1)} style={styles.navBtn}><ChevronLeft color={COLORS.ink} size={22} /></TouchableOpacity>
            <Text style={styles.dayText}>{isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next day" hitSlop={10} disabled={isToday} onPress={() => shift(1)} style={[styles.navBtn, isToday && { opacity: 0.3 }]}><ChevronRight color={COLORS.ink} size={22} /></TouchableOpacity>
          </View>

          {state === 'loading' ? <MetricSkeleton rows={2} height={110} /> : null}
          {state === 'error' ? <StatusBanner kind="error" title="Journal unavailable" message={error} actionLabel="Retry" onAction={() => { setState('loading'); load(); }} /> : null}

          {state === 'ready' ? (
            <GlassCard contentStyle={{ padding: 16 }}>
              <View style={styles.totalsTop}>
                <ProgressRing size={104} strokeWidth={10} progress={targets?.calories ? (totals.calories / targets.calories) * 100 : 0} label={`${Math.round(totals.calories)}`} caption="kcal"
                  accessibilityLabel={`${Math.round(totals.calories)} kilocalories${targets?.calories ? ` of ${targets.calories}` : ''}`} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.big}>{targets?.calories ? `${Math.max(0, Math.round(targets.calories - totals.calories))} kcal left` : 'No calorie target'}</Text>
                  <Text style={styles.muted}>{totals.count ? `${totals.count} meal${totals.count === 1 ? '' : 's'} logged` : 'No meals logged'}{targets?.calories ? ` · target ${targets.calories}` : ''}</Text>
                  {!targets?.calories ? <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/body-metrics')} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={styles.link}>Set targets in Body metrics</Text></TouchableOpacity> : null}
                </View>
              </View>
              <View style={{ marginTop: 14 }}>
                <MacroBar label="Protein" value={totals.protein_g} target={targets?.protein_g} color="#2b7de9" />
                <MacroBar label="Carbs" value={totals.carbs_g} target={targets?.carbs_g} color="#e39b00" />
                <MacroBar label="Fat" value={totals.fat_g} target={targets?.fat_g} color="#d9534f" />
                <MacroBar label="Fiber" value={totals.fiber_g} target={targets?.fiber_g} color="#2e9f6b" />
              </View>
              <Text style={styles.muted}>Totals include only meals you have saved.</Text>
            </GlassCard>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Scan a meal with the camera" disabled={scanning} onPress={() => runScan('camera')} style={[styles.actionPrimary, scanning && { opacity: 0.6 }]}>
              <Camera color="#fff" size={20} /><Text style={styles.actionPrimaryText}>Scan meal</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose a meal photo from your library" disabled={scanning} onPress={() => runScan('library')} style={[styles.action, scanning && { opacity: 0.6 }]}>
              <ImageIcon color={COLORS.ink} size={20} /><Text style={styles.actionText}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add a meal manually" disabled={scanning} onPress={openManual} style={[styles.action, scanning && { opacity: 0.6 }]}>
              <Pencil color={COLORS.ink} size={20} /><Text style={styles.actionText}>Manual</Text>
            </TouchableOpacity>
          </View>

          {scanning ? <View style={styles.scanning}><ActivityIndicator color={COLORS.blueText} /><Text style={styles.scanningText}>Analyzing the photo. This can take up to 30 seconds.</Text></View> : null}
          {scanNotice ? (
            <StatusBanner kind="error" title="Scan did not work" message={scanNotice.message} actionLabel={scanNotice.retry ? 'Try again' : undefined} onAction={scanNotice.retry ? () => runScan(lastSource.current) : undefined} style={{ marginTop: 10 }} />
          ) : null}

          <Text style={styles.sectionTitle}>Meals</Text>
          {state === 'ready' && entries.length === 0 ? <Text style={styles.empty}>{isToday ? 'No meals logged today.' : 'No meals logged on this day.'} Scan a meal or add one manually.</Text> : null}
          {entries.map((e) => (
            <View key={e.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryMeal}>{e.meal_type.toUpperCase()}{e.source === 'scan' ? ` · PHOTO ESTIMATE${e.confidence ? ` (${e.confidence.toLowerCase()} confidence)` : ''}` : ''}</Text>
                <Text style={styles.entryName} numberOfLines={2}>{e.name}</Text>
                <Text style={styles.entryMeta}>{Math.round(e.calories)} kcal · P {Math.round(e.protein_g)} · C {Math.round(e.carbs_g)} · F {Math.round(e.fat_g)} g · {new Date(e.logged_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${e.name}`} hitSlop={10} onPress={() => confirmDelete(e)} style={styles.del}><Trash2 color={COLORS.red} size={18} /></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {chatOpened ? (
        <View style={{ flex: 1, display: section === 'chat' ? 'flex' : 'none' }}>
          <PlanChat
            isNutritionist
            accent="#0f7a55"
            greeting="Hi, I'm your AI nutritionist. Ask about protein, meal ideas, or how your day is tracking against your targets."
            placeholder="Ask about nutrition"
            disclaimer="General nutrition information from an AI, not medical or dietary advice, and it can be wrong. It sees your profile, targets, and recent meals saved to your account, plus this conversation. It does not count anything toward your journal; use Scan or Manual for that."
            bottomPad={inset.contentBottom - 12}
          />
        </View>
      ) : null}

      <MealReviewSheet visible={sheetOpen} analysis={analysis} imageUri={imageUri} saving={saving} error={saveError} onSave={save}
        onClose={() => { if (!saving) { setSheetOpen(false); setAnalysis(null); setImageUri(null); } }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  headLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { color: COLORS.blueText, fontWeight: '700', fontSize: 14 },
  segment: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 10, backgroundColor: '#e8edf5', borderRadius: 14, padding: 3 },
  segBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  segActive: { backgroundColor: COLORS.blueText },
  segText: { color: COLORS.body, fontWeight: '800', fontSize: 14 },
  content: { paddingHorizontal: 16 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayText: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  totalsTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  big: { color: COLORS.ink, fontSize: 18, fontWeight: '800' },
  muted: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionPrimary: { flex: 1.4, minHeight: 50, borderRadius: 16, backgroundColor: COLORS.blueText, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  actionPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  action: { flex: 1, minHeight: 50, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: COLORS.ink, fontWeight: '700', fontSize: 14 },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.blueSoft, borderRadius: 14, padding: 12, marginTop: 10 },
  scanningText: { color: '#12507f', fontSize: 13, flex: 1 },
  sectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  empty: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  entry: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.line },
  entryMeal: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  entryName: { color: COLORS.ink, fontSize: 15, fontWeight: '700', marginTop: 2 },
  entryMeta: { color: COLORS.body, fontSize: 12, marginTop: 3 },
  del: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
