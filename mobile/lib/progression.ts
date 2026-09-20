export interface SetData { id: string; date: string; exercise_id: string; session_id?: string; weight_kg: number; reps: number; rir?: number | null; rpe?: number | null; }
export interface PRData extends SetData { prType: 'e1RM' | 'weight' | 'reps' | 'volume'; }

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Brzycki is used for low reps; Epley avoids its high-rep singularity. */
export function calculateE1RM(weight: number, reps: number, rir?: number | null): number {
  if (!finite(weight) || !finite(reps) || weight <= 0 || reps <= 0) return 0;
  const effectiveReps = Math.min(50, reps + (finite(rir) ? Math.max(0, Math.min(10, rir)) : 0));
  const result = effectiveReps <= 10 ? weight * (36 / (37 - effectiveReps)) : weight * (1 + effectiveReps / 30);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

export function detectPRs(sets: SetData[]): PRData[] {
  const prs: PRData[] = [];
  const sorted = sets.filter((set) => finite(set.weight_kg) && finite(set.reps) && set.weight_kg >= 0 && set.reps > 0 && Number.isFinite(Date.parse(set.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  let maxE1RM = 0; let maxWeight = 0; let maxVolume = 0;
  const maxRepsAtWeight = new Map<number, number>();
  for (const set of sorted) {
    const e1rm = calculateE1RM(set.weight_kg, set.reps, set.rir);
    const volume = set.weight_kg * set.reps;
    let prType: PRData['prType'] | null = null;
    if (e1rm > maxE1RM) prType = 'e1RM';
    else if (set.weight_kg > maxWeight) prType = 'weight';
    else if (set.reps > (maxRepsAtWeight.get(set.weight_kg) ?? 0)) prType = 'reps';
    else if (volume > maxVolume) prType = 'volume';
    maxE1RM = Math.max(maxE1RM, e1rm); maxWeight = Math.max(maxWeight, set.weight_kg); maxVolume = Math.max(maxVolume, volume);
    maxRepsAtWeight.set(set.weight_kg, Math.max(maxRepsAtWeight.get(set.weight_kg) ?? 0, set.reps));
    if (prType) prs.push({ ...set, prType });
  }
  return prs;
}

/** Conservative heuristic: four distinct sessions across at least 21 days. */
export function isPlateauing(sets: SetData[]): boolean {
  const bySession = new Map<string, { time: number; best: number }>();
  for (const set of sets) {
    const time = Date.parse(set.date); const e1rm = calculateE1RM(set.weight_kg, set.reps, set.rir);
    if (!Number.isFinite(time) || e1rm <= 0) continue;
    const key = set.session_id || set.date.slice(0, 10);
    const previous = bySession.get(key);
    if (!previous || e1rm > previous.best) bySession.set(key, { time, best: e1rm });
  }
  const sessions = [...bySession.values()].sort((a, b) => a.time - b.time);
  if (sessions.length < 4 || sessions[sessions.length - 1].time - sessions[sessions.length - 4].time < 21 * 86_400_000) return false;
  const lastFour = sessions.slice(-4);
  const oldBest = Math.max(lastFour[0].best, lastFour[1].best);
  const recentBest = Math.max(lastFour[2].best, lastFour[3].best);
  return recentBest < oldBest * 1.02;
}
