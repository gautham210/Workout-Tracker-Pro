import { findCatalogExercise, normalizeExerciseName } from '../../shared/exerciseCatalog.js';
import { fetchAndCacheCatalog, generateUUID, getDb, initDb } from './db';

export type PlannedExercise = {
  exerciseId: string; sets: number; reps?: number; repsMin?: number; repsMax?: number; weightKg?: number | null;
  rir?: number | null; rpe?: number | null; restSeconds?: number | null; warmup?: boolean; notes?: string | null;
};
export type WorkoutPlan = { title?: string; goal?: string | null; notes?: string | null; exercises: PlannedExercise[] };

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/**
 * Creates an unfinished local session (+ exercises + sets) in ONE transaction. Sets start incomplete; reps/weight are
 * only targets. `warmup: true` adds one leading warm-up set (no targets). Throws if an exercise is not in the local cache.
 */
export async function createSessionFromPlan(userId: string, plan: WorkoutPlan): Promise<string> {
  if (!userId) throw new Error('Sign in to start a workout.');
  const planned = (plan.exercises ?? []).filter((e) => e && e.exerciseId);
  if (!planned.length) throw new Error('Add at least one exercise to start a workout.');
  await initDb();
  const db = await getDb();
  const ids = [...new Set(planned.map((e) => e.exerciseId))];
  const known = async () => new Set((await db.getAllAsync<{ id: string }>(
    `SELECT id FROM exercises WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map((r) => r.id));
  let have = await known();
  if (ids.some((id) => !have.has(id))) {
    try { await fetchAndCacheCatalog(); } catch { /* reported below */ }
    have = await known();
  }
  const missing = ids.find((id) => !have.has(id));
  if (missing) throw new Error('One of the selected exercises is not in the exercise library on this device. Connect to the internet to refresh the library and try again.');

  const sessionId = generateUUID();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workout_sessions (id, user_id, date, split_type, split_day, notes, title, duration_minutes, is_finished, created_at, updated_at)
       VALUES (?, ?, ?, 'custom', 'Custom', ?, ?, 0, 0, ?, ?)`,
      [sessionId, userId, now, plan.notes?.slice(0, 4000) || null, (plan.title || plan.goal || '').slice(0, 120) || null, now, now]);
    for (const [index, ex] of planned.entries()) {
      const seId = generateUUID();
      await db.runAsync(
        'INSERT INTO session_exercises (id, session_id, exercise_id, order_index, notes, rest_seconds) VALUES (?, ?, ?, ?, ?, ?)',
        [seId, sessionId, ex.exerciseId, index, ex.notes?.slice(0, 1000) || null, ex.restSeconds != null ? clampInt(ex.restSeconds, 0, 1800, 90) : null]);
      const workSets = clampInt(ex.sets, 1, 20, 3);
      const reps = ex.repsMin ?? ex.reps;
      const targetReps = reps != null ? clampInt(reps, 1, 500, 10) : null;
      const targetWeight = ex.weightKg != null && Number.isFinite(Number(ex.weightKg)) && Number(ex.weightKg) >= 0 ? Math.min(1000, Number(ex.weightKg)) : null;
      let number = 1;
      if (ex.warmup) {
        await db.runAsync('INSERT INTO sets (id, session_exercise_id, set_number, weight_kg, reps, completed, is_warmup) VALUES (?, ?, ?, NULL, NULL, 0, 1)',
          [generateUUID(), seId, number++]);
      }
      for (let i = 0; i < workSets; i++) {
        await db.runAsync('INSERT INTO sets (id, session_exercise_id, set_number, weight_kg, reps, completed, is_warmup) VALUES (?, ?, ?, ?, ?, 0, 0)',
          [generateUUID(), seId, number++, targetWeight, targetReps]);
      }
    }
  });
  return sessionId;
}

/** Most recent unfinished session for the user, or null. */
export async function findResumableSession(userId: string): Promise<string | null> {
  if (!userId) return null;
  await initDb();
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT ws.id FROM workout_sessions ws
     WHERE ws.user_id = ? AND ws.is_finished = 0 AND EXISTS (SELECT 1 FROM session_exercises se WHERE se.session_id = ws.id)
     ORDER BY ws.created_at DESC LIMIT 1`, [userId]);
  return row?.id ?? null;
}

/** Deletes an UNFINISHED local session (never touches finished workouts). */
export async function discardSession(userId: string, id: string): Promise<void> {
  if (!userId || !id) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const owned = 'SELECT id FROM workout_sessions WHERE id = ? AND user_id = ? AND is_finished = 0';
    await db.runAsync(`DELETE FROM sets WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id IN (${owned}))`, [id, userId]);
    await db.runAsync(`DELETE FROM session_exercises WHERE session_id IN (${owned})`, [id, userId]);
    await db.runAsync('DELETE FROM workout_sessions WHERE id = ? AND user_id = ? AND is_finished = 0', [id, userId]);
  });
}

/** Exact (normalized) name/alias match against the catalog. Never fuzzy-invents a match. */
export function matchExerciseName(name: string, catalog: { id: string; name: string }[]): { id: string; name: string } | null {
  const key = normalizeExerciseName(name);
  if (!key || !catalog.length) return null;
  const exact = catalog.find((c) => normalizeExerciseName(c.name) === key);
  if (exact) return exact;
  const entry = findCatalogExercise(name);
  if (!entry) return null;
  const canonical = normalizeExerciseName(entry.name);
  const byCanonical = catalog.find((c) => normalizeExerciseName(c.name) === canonical);
  if (byCanonical) return byCanonical;
  const labels = new Set([canonical, ...entry.aliases.map(normalizeExerciseName)]);
  return catalog.find((c) => labels.has(normalizeExerciseName(c.name))) ?? null;
}

export type PreviousPerformance = { date: string; sets: { weight_kg: number | null; reps: number | null }[] };

/** Last completed working sets per exercise from finished sessions stored on THIS device. */
export async function getPreviousPerformance(userId: string, exerciseIds: string[], excludeSessionId?: string): Promise<Record<string, PreviousPerformance>> {
  const out: Record<string, PreviousPerformance> = {};
  if (!userId) return out;
  const db = await getDb();
  for (const exerciseId of [...new Set(exerciseIds)]) {
    const latest = await db.getFirstAsync<{ id: string; date: string }>(
      `SELECT ws.id, ws.date FROM workout_sessions ws JOIN session_exercises se ON se.session_id = ws.id
       WHERE ws.user_id = ? AND ws.is_finished = 1 AND ws.id != ? AND se.exercise_id = ?
         AND EXISTS (SELECT 1 FROM sets s WHERE s.session_exercise_id = se.id AND s.completed = 1 AND COALESCE(s.is_warmup, 0) = 0)
       ORDER BY ws.date DESC LIMIT 1`, [userId, excludeSessionId ?? '', exerciseId]);
    if (!latest) continue;
    const sets = await db.getAllAsync<{ weight_kg: number | null; reps: number | null }>(
      `SELECT s.weight_kg, s.reps FROM sets s JOIN session_exercises se ON se.id = s.session_exercise_id
       WHERE se.session_id = ? AND se.exercise_id = ? AND s.completed = 1 AND COALESCE(s.is_warmup, 0) = 0 ORDER BY s.set_number`, [latest.id, exerciseId]);
    if (sets.length) out[exerciseId] = { date: latest.date, sets };
  }
  return out;
}
