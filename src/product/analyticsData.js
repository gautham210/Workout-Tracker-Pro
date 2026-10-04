import { supabase } from '../lib/supabase';
import { calculateBodyMetrics } from '../lib/athleteMetrics';
import { addLocalDays, localDayStart, profileAge } from './analytics';

const GRAPH = (warmup) => `id,date,split_type,split_day,duration_minutes,is_finished,session_exercises(id,order_index,exercises(id,name,muscle_group),sets(id,set_number,weight_kg,reps,rpe,rir,completed${warmup ? ',is_warmup' : ''}))`;
let warmupColumn = true; // flips off once if the linked database predates is_warmup

/** One page of finished sessions, newest first. Throws on failure. */
export async function fetchSessionPage(userId, { from = 0, size = 50 } = {}) {
  const run = (warmup) => supabase.from('workout_sessions').select(GRAPH(warmup)).eq('user_id', userId).eq('is_finished', true).order('date', { ascending: false }).range(from, from + size - 1);
  let { data, error } = await run(warmupColumn);
  if (error && warmupColumn && /is_warmup/i.test(error.message || '')) { warmupColumn = false; ({ data, error } = await run(false)); }
  if (error) throw error;
  return data || [];
}

/** Full finished-session history, paginated in chunks (no 80-session ceiling). */
export async function fetchAllSessions(userId, { pageSize = 100, maxSessions = 3000 } = {}) {
  const all = [];
  for (let from = 0; from < maxSessions; from += pageSize) {
    const page = await fetchSessionPage(userId, { from, size: pageSize });
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

/** Light query: only the dates of finished sessions in the last `days` local days. */
export async function fetchTrainingDays(userId, days = 400, now = new Date()) {
  const since = addLocalDays(localDayStart(now), -days).toISOString();
  const rows = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await supabase.from('workout_sessions').select('id,date,is_finished').eq('user_id', userId).eq('is_finished', true).gte('date', since).order('date', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  return rows;
}

/**
 * One canonical athlete context for Home, Progress, Coach and Nutrition: the
 * profile row, latest real weight, saved targets and the metrics derived from
 * them. Never fabricates a value that is not stored.
 */
export async function loadAthleteContext(userId, fallbackProfile = null) {
  const [profileRes, metricRes, weightRes, targetRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('body_metrics_logs').select('logged_at,weight_kg,waist_cm,neck_cm,hips_cm').eq('user_id', userId).not('weight_kg', 'is', null).order('logged_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bodyweight_logs').select('date,weight_kg').eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_targets').select('calories,protein_g,carbs_g,fat_g,fiber_g,water_ml,source').eq('user_id', userId).maybeSingle(),
  ]);
  const profile = profileRes.data || fallbackProfile || null;
  const metricRow = metricRes.error ? null : metricRes.data;
  const weightRow = weightRes.error ? null : weightRes.data;
  const newest = [metricRow && { at: metricRow.logged_at, kg: metricRow.weight_kg }, weightRow && { at: weightRow.date, kg: weightRow.weight_kg }].filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const weightKg = newest && Number(newest.kg) > 0 ? Number(newest.kg) : null;
  const targets = targetRes.error ? null : targetRes.data || null;
  const age = profileAge(profile);
  const metrics = calculateBodyMetrics({
    weightKg, heightCm: profile?.height_cm, age, sex: profile?.sex || profile?.gender,
    waistCm: metricRow?.waist_cm, neckCm: metricRow?.neck_cm, hipsCm: metricRow?.hips_cm,
    activityLevel: profile?.activity_level, goal: profile?.training_goal,
  });
  return { profile, weightKg, weightAt: newest?.at || null, targets, metrics, age, errors: [profileRes.error, targetRes.error].filter(Boolean) };
}
