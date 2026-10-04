import type { LocalSession, LocalSessionExercise, LocalSet } from './db';
import { getDb } from './db';
import { calculateE1RM, detectPRs, isPlateauing, SetData } from './progression';

/** Everything here derives from finished sessions stored on this device (SQLite). No network, no invented values. */
const DAY_MS = 86_400_000;

export const isWorkingSet = (set: LocalSet) => set.completed === 1 && !set.is_warmup && Number(set.reps) > 0;
const parsedDate = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };

export function sessionVolume(session: LocalSession): number {
  let total = 0;
  for (const ex of session.exercises) for (const set of ex.sets) {
    if (isWorkingSet(set)) total += (Number(set.weight_kg) || 0) * (Number(set.reps) || 0);
  }
  return Math.round(total);
}
export function sessionSetCounts(session: LocalSession) {
  let working = 0; let warmup = 0;
  for (const ex of session.exercises) for (const set of ex.sets) {
    if (set.completed !== 1) continue;
    if (set.is_warmup) warmup += 1; else working += 1;
  }
  return { working, warmup };
}
export function exerciseVolume(ex: LocalSessionExercise): number {
  return Math.round(ex.sets.filter(isWorkingSet).reduce((sum, s) => sum + (Number(s.weight_kg) || 0) * (Number(s.reps) || 0), 0));
}
export function sessionTitle(session: LocalSession): string {
  return (session.title || session.split_day || (session.split_type && session.split_type !== 'custom' ? session.split_type : '') || 'Workout').toString();
}

/** Monday 00:00 local of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

export async function countFinishedSessions(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sessions WHERE user_id = ? AND is_finished = 1', [userId]);
  return row?.n ?? 0;
}

export type HomeStats = {
  totalFinished: number; thisWeekCount: number; thisWeekVolume: number; weekStreak: number;
  last: { id: string; title: string; date: string; volume: number; exerciseCount: number } | null;
};

export function computeHomeStats(sessions: LocalSession[], now = new Date()): HomeStats {
  const weekStartMs = weekStart(now).getTime();
  let thisWeekCount = 0; let thisWeekVolume = 0;
  const weeksWithWork = new Set<number>();
  for (const s of sessions) {
    const t = parsedDate(s.date); if (t === null) continue;
    const ws = weekStart(new Date(t)).getTime();
    weeksWithWork.add(ws);
    if (t >= weekStartMs) { thisWeekCount += 1; thisWeekVolume += sessionVolume(s); }
  }
  // Week streak: consecutive Monday-start weeks with >= 1 finished workout. The current week is not
  // counted as broken until it ends, so a streak survives until the week is over.
  let streak = 0;
  const cursor = new Date(weekStartMs);
  if (!weeksWithWork.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  while (weeksWithWork.has(cursor.getTime())) { streak += 1; cursor.setDate(cursor.getDate() - 7); }
  const first = sessions[0];
  return {
    totalFinished: sessions.length, thisWeekCount, thisWeekVolume: Math.round(thisWeekVolume), weekStreak: streak,
    last: first ? { id: first.id, title: sessionTitle(first), date: first.date, volume: sessionVolume(first), exerciseCount: first.exercises.length } : null,
  };
}

export function workoutsInLastDays(sessions: LocalSession[], days: number, now = Date.now()): number {
  return sessions.filter((s) => { const t = parsedDate(s.date); return t !== null && t >= now - days * DAY_MS && t <= now + DAY_MS; }).length;
}

export type WeekBucket = { start: string; label: string; volume: number; count: number };
/** Last `weeks` calendar weeks (oldest first), including empty weeks so gaps are visible. */
export function weeklyVolume(sessions: LocalSession[], weeks = 8, now = new Date()): WeekBucket[] {
  const current = weekStart(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(current); d.setDate(d.getDate() - i * 7);
    buckets.push({ start: d.toISOString(), label: `${d.getMonth() + 1}/${d.getDate()}`, volume: 0, count: 0 });
  }
  const startMs = new Date(buckets[0].start).getTime();
  for (const s of sessions) {
    const t = parsedDate(s.date); if (t === null || t < startMs) continue;
    const idx = Math.min(weeks - 1, Math.floor((weekStart(new Date(t)).getTime() - startMs + 43_200_000) / (7 * DAY_MS)));
    if (idx < 0) continue;
    buckets[idx].volume += sessionVolume(s); buckets[idx].count += 1;
  }
  return buckets;
}

export type ExerciseSummary = {
  exerciseId: string; name: string; muscle: string | null; sessions: number; bestE1rm: number;
  plateau: boolean; plateauFrom?: number; plateauTo?: number; recentPR: { date: string; e1rm: number; previous: number } | null;
};

/** Per-exercise e1RM PRs and plateau flags from local working sets only. */
export function summarizeExercises(sessions: LocalSession[], now = Date.now()): ExerciseSummary[] {
  const byExercise = new Map<string, { name: string; muscle: string | null; sets: SetData[] }>();
  for (const s of sessions) {
    const t = parsedDate(s.date); if (t === null) continue;
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (!isWorkingSet(set) || !(Number(set.weight_kg) > 0)) continue;
        const entry = byExercise.get(ex.exercise_id) ?? { name: ex.name, muscle: ex.muscle_group, sets: [] };
        entry.sets.push({ id: set.id, date: s.date, session_id: s.id, exercise_id: ex.exercise_id, weight_kg: Number(set.weight_kg), reps: Number(set.reps), rir: set.rir, rpe: set.rpe });
        byExercise.set(ex.exercise_id, entry);
      }
    }
  }
  const out: ExerciseSummary[] = [];
  for (const [exerciseId, info] of byExercise) {
    const sessionIds = new Set(info.sets.map((x) => x.session_id));
    let bestE1rm = 0;
    for (const x of info.sets) bestE1rm = Math.max(bestE1rm, calculateE1RM(x.weight_kg, x.reps, x.rir));
    // A first-ever set is trivially a "PR"; require a strictly earlier session to compare against.
    const ordered = [...info.sets].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const firstTime = Date.parse(ordered[0].date);
    const prs = detectPRs(info.sets).filter((p) => p.prType === 'e1RM' && Date.parse(p.date) > firstTime && Date.parse(p.date) >= now - 30 * DAY_MS);
    let recentPR: ExerciseSummary['recentPR'] = null;
    if (prs.length) {
      const top = prs[prs.length - 1];
      const topTime = Date.parse(top.date);
      let previous = 0;
      for (const x of ordered) if (Date.parse(x.date) < topTime) previous = Math.max(previous, calculateE1RM(x.weight_kg, x.reps, x.rir));
      if (previous > 0) recentPR = { date: top.date, e1rm: calculateE1RM(top.weight_kg, top.reps, top.rir), previous };
    }
    const plateau = isPlateauing(info.sets);
    let plateauFrom: number | undefined; let plateauTo: number | undefined;
    if (plateau) {
      const per = new Map<string, { t: number; best: number }>();
      for (const x of info.sets) {
        const e = calculateE1RM(x.weight_kg, x.reps, x.rir); const prev = per.get(x.session_id!);
        if (!prev || e > prev.best) per.set(x.session_id!, { t: Date.parse(x.date), best: e });
      }
      const last4 = [...per.values()].sort((a, b) => a.t - b.t).slice(-4);
      plateauFrom = Math.max(last4[0].best, last4[1].best); plateauTo = Math.max(last4[2].best, last4[3].best);
    }
    out.push({ exerciseId, name: info.name, muscle: info.muscle, sessions: sessionIds.size, bestE1rm, plateau, plateauFrom, plateauTo, recentPR });
  }
  return out.sort((a, b) => b.bestE1rm - a.bestE1rm);
}

export type MuscleRecency = { muscle: string; daysSince: number; sessionsIn90d: number };
/** Muscle groups trained before but not recently, from the exercise catalogue's muscle_group on your own sessions. */
export function muscleRecency(sessions: LocalSession[], now = Date.now()): MuscleRecency[] {
  const map = new Map<string, { last: number; sessions: Set<string> }>();
  for (const s of sessions) {
    const t = parsedDate(s.date); if (t === null || t < now - 90 * DAY_MS) continue;
    for (const ex of s.exercises) {
      if (!ex.muscle_group || !ex.sets.some(isWorkingSet)) continue;
      const entry = map.get(ex.muscle_group) ?? { last: 0, sessions: new Set<string>() };
      entry.last = Math.max(entry.last, t); entry.sessions.add(s.id); map.set(ex.muscle_group, entry);
    }
  }
  return [...map.entries()].map(([muscle, v]) => ({ muscle, daysSince: Math.floor((now - v.last) / DAY_MS), sessionsIn90d: v.sessions.size }))
    .sort((a, b) => b.daysSince - a.daysSince);
}

export const formatKg = (kg: number) => `${Math.round(kg).toLocaleString()} kg`;
export const formatDay = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => {
  const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, opts) : 'Unknown date';
};
export function relativeDays(iso: string, now = Date.now()): string {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return 'unknown date';
  const days = Math.floor((now - t) / DAY_MS);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
