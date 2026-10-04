import { supabase } from '../lib/supabase';
import { enrichExercises } from './exerciseMetadata';

export const kg = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);

export const sessionVolume = (session) => (session.session_exercises || []).reduce(
  (total, sessionExercise) => total + (sessionExercise.sets || []).reduce(
    (setTotal, set) => setTotal + ((set.completed === false ? 0 : 1) * (Number(set.weight_kg) || 0) * (Number(set.reps) || 0)), 0,
  ), 0,
);

export function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function computeStreak(sessions = []) {
  const completed = new Set(sessions.filter((session) => session.is_finished !== false).map((session) => localDayKey(session.date)));
  if (!completed.size) return 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let index = 0; index < 366; index += 1) {
    const key = localDayKey(cursor);
    if (completed.has(key)) streak += 1;
    else if (index > 0) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function getCompletedSessions(userId, limit = 80) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id,date,split_type,split_day,duration_minutes,is_finished,session_exercises(id,order_index,exercises(id,name,muscle_group),sets(id,set_number,weight_kg,reps,rpe,rir,completed))')
    .eq('user_id', userId)
    .eq('is_finished', true)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

const CATALOG_LIMIT = 500;
const FULL_COLUMNS = 'id,name,muscle_group,description,aliases,equipment,movement_pattern,difficulty,primary_muscles,secondary_muscles,instructions,form_cues,common_mistakes,safety_notes,visual_key';
const LEGACY_COLUMNS = 'id,name,muscle_group,description';
// ilike treats % _ and \ as wildcards; a search for "50%" must not match everything.
const likePattern = (value) => `%${value.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Loads up to 500 catalogue rows (the whole shared catalogue). `slug` is selected when the column
 * exists; older deployments transparently fall back to fewer columns. Pass an AbortSignal to
 * cancel a superseded search.
 */
export async function getExerciseCatalog(query = '', { signal, limit = CATALOG_LIMIT } = {}) {
  const search = String(query || '').trim();
  const run = (columns) => {
    let request = supabase.from('exercises').select(columns).order('name').limit(limit);
    if (search) request = request.ilike('name', likePattern(search));
    if (signal) request = request.abortSignal(signal);
    return request;
  };
  let lastError = null;
  for (const columns of [`slug,${FULL_COLUMNS}`, FULL_COLUMNS, LEGACY_COLUMNS]) {
    const { data, error } = await run(columns);
    if (!error) return enrichExercises(data || []);
    lastError = error;
    if (signal?.aborted) break;
  }
  throw lastError;
}
