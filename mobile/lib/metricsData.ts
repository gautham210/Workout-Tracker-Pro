import { supabase } from './supabase';
import { isOfflineError } from './api';
import { EMPTY_METRICS_FORM, MetricsForm, todayDateKey } from './metrics';

export type ProfileMetrics = {
  name: string | null; height_cm: number | null; sex: string | null; training_goal: string | null; activity_level: string | null;
  birth_year: number | null; age: number | null; gender: string | null;
};
export type BodyLog = {
  id: string; logged_at: string; weight_kg: number | null; waist_cm: number | null; neck_cm: number | null; chest_cm: number | null; hips_cm: number | null;
};
export type WeightPoint = { date: string; weightKg: number };
export type TargetsRow = { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null; water_ml: number | null; source: string | null };

/** Turns a Supabase/network failure into a message that is honest about what happened. */
export function describeDataError(error: unknown, what = 'your data', verb: 'loaded' | 'saved' = 'loaded'): string {
  if (isOfflineError(error)) return `You appear to be offline, so ${what} could not be ${verb}. Connect and try again.`;
  const message = String((error as { message?: unknown } | null)?.message ?? '').trim();
  if (/permission denied|42501|jwt/i.test(message)) return `You do not have access to ${what}. Sign out and back in, then retry.`;
  if (/does not exist|schema cache|42P01|PGRST/i.test(message)) return `${what[0].toUpperCase()}${what.slice(1)} is not available on this server yet (database update pending).`;
  return message || `${what[0].toUpperCase()}${what.slice(1)} could not be ${verb}.`;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export async function fetchProfileMetrics(userId: string): Promise<ProfileMetrics | null> {
  const { data, error } = await supabase.from('profiles')
    .select('name,height_cm,sex,training_goal,activity_level,birth_year,age,gender').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    name: typeof row.name === 'string' ? row.name : null, height_cm: num(row.height_cm), sex: (row.sex as string) ?? null,
    training_goal: (row.training_goal as string) ?? null, activity_level: (row.activity_level as string) ?? null,
    birth_year: num(row.birth_year), age: num(row.age), gender: (row.gender as string) ?? null,
  };
}

export async function fetchBodyLogs(userId: string, limit = 120): Promise<BodyLog[]> {
  const { data, error } = await supabase.from('body_metrics_logs')
    .select('id,logged_at,weight_kg,waist_cm,neck_cm,chest_cm,hips_cm').eq('user_id', userId).order('logged_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), logged_at: String(r.logged_at).slice(0, 10), weight_kg: num(r.weight_kg), waist_cm: num(r.waist_cm),
    neck_cm: num(r.neck_cm), chest_cm: num(r.chest_cm), hips_cm: num(r.hips_cm),
  }));
}

/** Weight history merged from body_metrics_logs and legacy bodyweight_logs (one point per day, ascending). */
export async function fetchWeightHistory(userId: string, limit = 120): Promise<WeightPoint[]> {
  const [metrics, legacy] = await Promise.all([
    supabase.from('body_metrics_logs').select('logged_at,weight_kg').eq('user_id', userId).not('weight_kg', 'is', null).order('logged_at', { ascending: false }).limit(limit),
    supabase.from('bodyweight_logs').select('date,weight_kg').eq('user_id', userId).order('date', { ascending: false }).limit(limit),
  ]);
  if (metrics.error) throw metrics.error;
  const byDay = new Map<string, number>();
  // Legacy first so body_metrics_logs wins on the same day.
  if (!legacy.error) {
    for (const r of (legacy.data ?? []) as { date: string; weight_kg: unknown }[]) {
      const w = num(r.weight_kg); if (w !== null && r.date) byDay.set(String(r.date).slice(0, 10), w);
    }
  }
  for (const r of (metrics.data ?? []) as { logged_at: string; weight_kg: unknown }[]) {
    const w = num(r.weight_kg); if (w !== null) byDay.set(String(r.logged_at).slice(0, 10), w);
  }
  return [...byDay.entries()].map(([date, weightKg]) => ({ date, weightKg })).sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
}

export async function fetchTargets(userId: string): Promise<TargetsRow | null> {
  const { data, error } = await supabase.from('nutrition_targets')
    .select('calories,protein_g,carbs_g,fat_g,fiber_g,water_ml,source').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return { calories: num(r.calories), protein_g: num(r.protein_g), carbs_g: num(r.carbs_g), fat_g: num(r.fat_g), fiber_g: num(r.fiber_g), water_ml: num(r.water_ml), source: (r.source as string) ?? null };
}

export async function saveAthleteMetrics(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('save_athlete_metrics', { p_payload: payload });
  if (error) throw error;
}

/** Seeds the form from the persisted profile + latest log so the user edits real values, never placeholders. */
export function formFromProfile(profile: ProfileMetrics | null, latest: BodyLog | null): MetricsForm {
  const text = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const age = profile?.age ?? (profile?.birth_year ? new Date().getFullYear() - profile.birth_year : null);
  const sexRaw = profile?.sex ?? profile?.gender ?? 'unspecified';
  const sex = sexRaw === 'female' || sexRaw === 'male' ? sexRaw : 'unspecified';
  const activity = ['sedentary', 'light', 'moderate', 'very_active', 'athlete'].includes(profile?.activity_level ?? '') ? profile!.activity_level : 'moderate';
  const goal = ['strength', 'hypertrophy', 'fat_loss', 'maintenance', 'general_fitness'].includes(profile?.training_goal ?? '') ? profile!.training_goal : 'general_fitness';
  return {
    ...EMPTY_METRICS_FORM, logged_at: todayDateKey(),
    height_cm: text(profile?.height_cm), age: text(age), sex: sex as MetricsForm['sex'],
    activity_level: activity as MetricsForm['activity_level'], training_goal: goal as MetricsForm['training_goal'],
    weight_kg: text(latest?.weight_kg), waist_cm: text(latest?.waist_cm), neck_cm: text(latest?.neck_cm),
    chest_cm: text(latest?.chest_cm), hips_cm: text(latest?.hips_cm),
  };
}
