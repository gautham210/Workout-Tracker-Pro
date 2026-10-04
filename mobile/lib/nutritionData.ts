import { supabase } from './supabase';
import { ApiError, isOfflineError } from './api';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export type Confidence = 'High' | 'Medium' | 'Low';

export type FoodEntry = {
  id: string; logged_at: string; meal_type: MealType; name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number;
  fiber_g: number | null; source: 'manual' | 'scan' | 'ai_assisted'; confidence: Confidence | null;
};
export type NutritionTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; count: number };

export type ScanItem = {
  name: string; estimatedPortion: string; caloriesRange: string; proteinRange: string; carbsRange: string; fatRange: string;
};
export type ScanAnalysis = {
  detectedFoods: string[]; items: ScanItem[]; caloriesRange: string; proteinRange: string; carbsRange: string; fatRange: string;
  confidence: Confidence; assumptions: string[]; followUpQuestion: string | null;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Local calendar day as [start, end) ISO instants, so "today" follows the user's clock, not UTC. */
export function dayBounds(day: Date) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function fetchFoodEntriesForDay(userId: string, day: Date): Promise<FoodEntry[]> {
  const { startIso, endIso } = dayBounds(day);
  const { data, error } = await supabase.from('food_entries')
    .select('id,logged_at,meal_type,name,calories,protein_g,carbs_g,fat_g,fiber_g,source,confidence')
    .eq('user_id', userId).gte('logged_at', startIso).lt('logged_at', endIso).order('logged_at', { ascending: true }).limit(200);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), logged_at: String(r.logged_at), meal_type: (MEAL_TYPES.includes(r.meal_type as MealType) ? r.meal_type : 'snack') as MealType,
    name: String(r.name ?? ''), calories: n(r.calories), protein_g: n(r.protein_g), carbs_g: n(r.carbs_g), fat_g: n(r.fat_g),
    fiber_g: r.fiber_g === null || r.fiber_g === undefined ? null : n(r.fiber_g),
    source: (r.source as FoodEntry['source']) ?? 'manual', confidence: (r.confidence as Confidence) ?? null,
  }));
}

export function sumEntries(entries: FoodEntry[]): NutritionTotals {
  return entries.reduce<NutritionTotals>((sum, e) => ({
    calories: sum.calories + e.calories, protein_g: sum.protein_g + e.protein_g, carbs_g: sum.carbs_g + e.carbs_g,
    fat_g: sum.fat_g + e.fat_g, fiber_g: sum.fiber_g + (e.fiber_g ?? 0), count: sum.count + 1,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, count: 0 });
}

export type NewFoodEntry = {
  name: string; meal_type: MealType; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null;
  source: 'manual' | 'scan'; confidence: Confidence | null; assumptions: string[]; analysis: Record<string, unknown> | null;
};

export async function insertFoodEntry(userId: string, entry: NewFoodEntry, loggedAt = new Date()): Promise<void> {
  const { error } = await supabase.from('food_entries').insert({
    user_id: userId, logged_at: loggedAt.toISOString(), meal_type: entry.meal_type, name: entry.name.trim().slice(0, 200),
    calories: entry.calories, protein_g: entry.protein_g, carbs_g: entry.carbs_g, fat_g: entry.fat_g, fiber_g: entry.fiber_g,
    source: entry.source, confidence: entry.confidence, assumptions: entry.assumptions.slice(0, 12).map((a) => a.slice(0, 300)), analysis: entry.analysis,
  });
  if (error) throw error;
}

export async function deleteFoodEntry(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('food_entries').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

/** Midpoint of "low-high" (the scanner's range format). Returns null when the range cannot be read. */
export function parseRange(value: unknown): { low: number; high: number; mid: number } | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*$/.exec(String(value ?? ''));
  if (match) {
    const low = Number(match[1]); const high = Number(match[2]);
    return { low: Math.min(low, high), high: Math.max(low, high), mid: Math.round((low + high) / 2) };
  }
  const single = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(String(value ?? ''));
  return single ? { low: Number(single[1]), high: Number(single[1]), mid: Math.round(Number(single[1])) } : null;
}

/** Validates the {macros} object from /api/parse-food; null when it is not usable. */
export function readScanAnalysis(result: unknown): ScanAnalysis | null {
  const macros = (result as { macros?: Record<string, unknown> } | null)?.macros;
  if (!macros || typeof macros !== 'object') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (!parseRange(macros.caloriesRange)) return null;
  const confidence = macros.confidence === 'High' || macros.confidence === 'Medium' || macros.confidence === 'Low' ? macros.confidence : 'Low';
  const items = (Array.isArray(macros.items) ? macros.items : []).slice(0, 15).map((raw) => {
    const item = raw as Record<string, unknown>;
    return { name: str(item.name).slice(0, 120), estimatedPortion: str(item.estimatedPortion).slice(0, 120), caloriesRange: str(item.caloriesRange), proteinRange: str(item.proteinRange), carbsRange: str(item.carbsRange), fatRange: str(item.fatRange) };
  }).filter((item) => item.name);
  return {
    detectedFoods: (Array.isArray(macros.detectedFoods) ? macros.detectedFoods : []).map(String).slice(0, 15),
    items, caloriesRange: str(macros.caloriesRange), proteinRange: str(macros.proteinRange), carbsRange: str(macros.carbsRange), fatRange: str(macros.fatRange),
    confidence, assumptions: (Array.isArray(macros.assumptions) ? macros.assumptions : []).map(String).slice(0, 12),
    followUpQuestion: str(macros.followUpQuestion) || null,
  };
}

/** Compact, size-capped copy of the scan stored in food_entries.analysis (DB limit is 20 KB). */
export function buildAnalysisJson(analysis: ScanAnalysis, items: ScanItem[]): Record<string, unknown> {
  const full = { kind: 'photo_estimate', detectedFoods: analysis.detectedFoods, items, caloriesRange: analysis.caloriesRange, proteinRange: analysis.proteinRange,
    carbsRange: analysis.carbsRange, fatRange: analysis.fatRange, confidence: analysis.confidence, followUpQuestion: analysis.followUpQuestion };
  if (JSON.stringify(full).length <= 9000) return full;
  return { ...full, items: items.slice(0, 5).map((i) => ({ name: i.name, estimatedPortion: i.estimatedPortion })) };
}

export const MAX_IMAGE_BYTES = 3_500_000;

/** Maps scan failures to specific, actionable copy. */
export function describeScanError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ApiError) {
    if (error.code === 'unauthorized') return { message: error.message, retryable: false };
    if (error.code === 'rate_limited') return { message: 'You have scanned a lot of meals in a short time. Wait a minute and try again.', retryable: true };
    if (error.code === 'network') return { message: 'You appear to be offline. Meal scanning needs a connection; you can still log the meal manually.', retryable: true };
    if (error.code === 'timeout' || error.status === 504) return { message: 'The scan took too long. Try again, ideally with a smaller or clearer photo.', retryable: true };
    if (error.status === 413) return { message: 'That image is too large. Take a new photo or choose a smaller one (under 3.5 MB).', retryable: false };
    if (error.status === 415) return { message: 'That image format is not supported. Use a JPEG, PNG, or WebP photo.', retryable: false };
    if (error.status === 422) return { message: 'That image looks damaged or incomplete. Try taking the photo again.', retryable: false };
    if (error.status === 502) return { message: 'The scanner could not turn that photo into a usable estimate. Try a clear photo with the food and portion in view, or log it manually.', retryable: true };
    if (error.code === 'unavailable' || error.status === 503) return { message: 'Food scanning is temporarily unavailable. Try again shortly or log the meal manually.', retryable: true };
    if (error.code === 'config') return { message: error.message, retryable: false };
    return { message: error.message, retryable: true };
  }
  if (isOfflineError(error)) return { message: 'You appear to be offline. Meal scanning needs a connection; you can still log the meal manually.', retryable: true };
  return { message: String((error as Error)?.message ?? 'The meal could not be analyzed.'), retryable: true };
}
