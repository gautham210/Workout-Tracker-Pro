/**
 * Calculate estimated 1 Rep Max (e1RM) using the Brzycki Formula.
 * If RIR is provided, we treat it as extra reps left in the tank.
 * E.g., 100kg x 8 reps @ 2 RIR is equivalent to 100kg x 10 reps to failure.
 */
export function calculateE1RM(weight: number, reps: number, rir?: number | null): number {
  if (!weight || !reps || reps < 1) return 0;
  
  const effectiveReps = rir !== undefined && rir !== null ? reps + rir : reps;
  
  // Brzycki Formula: weight * (36 / (37 - reps))
  // Best for reps < 10, but widely used.
  if (effectiveReps >= 37) return weight; // Prevent division by zero or negative
  
  return weight * (36 / (37 - effectiveReps));
}

export interface SetData {
  id: string;
  date: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  rir?: number;
  rpe?: number;
}

export interface PRData extends SetData {
  prType: 'e1RM' | 'weight' | 'reps' | 'volume';
}

/**
 * Detects PRs (Personal Records) based on e1RM, weight, reps at weight, and volume.
 */
export function detectPRs(sets: SetData[]): PRData[] {
  const prs: PRData[] = [];
  let maxE1RM = 0;
  let maxWeight = 0;
  let maxVolume = 0;
  const maxRepsAtWeight: Record<number, number> = {};
  
  // Sort chronologically (oldest first)
  const sorted = [...sets].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  for (const set of sorted) {
    const e1rm = calculateE1RM(set.weight_kg, set.reps, set.rir);
    const volume = set.weight_kg * set.reps;
    
    let isPR = false;
    let prType: 'e1RM' | 'weight' | 'reps' | 'volume' = 'e1RM';

    if (e1rm > maxE1RM) {
      maxE1RM = e1rm;
      isPR = true;
      prType = 'e1RM';
    } else if (set.weight_kg > maxWeight) {
      maxWeight = set.weight_kg;
      isPR = true;
      prType = 'weight';
    } else if (volume > maxVolume) {
      maxVolume = volume;
      isPR = true;
      prType = 'volume';
    } else {
      const prevMaxReps = maxRepsAtWeight[set.weight_kg] || 0;
      if (set.reps > prevMaxReps) {
        isPR = true;
        prType = 'reps';
      }
    }
    
    // Update trackers
    if (set.weight_kg > maxWeight) maxWeight = set.weight_kg;
    if (volume > maxVolume) maxVolume = volume;
    if (!maxRepsAtWeight[set.weight_kg] || set.reps > maxRepsAtWeight[set.weight_kg]) {
      maxRepsAtWeight[set.weight_kg] = set.reps;
    }

    if (isPR) {
      prs.push({ ...set, prType });
    }
  }
  
  return prs;
}

const PLATEAU_TOLERANCE_MULTIPLIER = 1.02; // 2% improvement threshold

/**
 * Plateau Heuristic: Checks both a 30-day window and a 4-comparable-sessions window.
 * Returns true if a "Possible plateau" is detected.
 */
export function isPlateauing(sets: SetData[]): boolean {
  if (sets.length < 4) return false;

  // Sort chronological
  const sorted = [...sets].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // 1. Last 4 comparable sessions heuristic
  // We compare the max e1RM of the most recent 2 sessions against the 2 sessions prior to those.
  const last4 = sorted.slice(-4);
  const older2 = last4.slice(0, 2);
  const newer2 = last4.slice(2, 4);

  const older2Max = Math.max(...older2.map(s => calculateE1RM(s.weight_kg, s.reps, s.rir)));
  const newer2Max = Math.max(...newer2.map(s => calculateE1RM(s.weight_kg, s.reps, s.rir)));

  if (newer2Max <= older2Max * PLATEAU_TOLERANCE_MULTIPLIER) {
    return true; // Possible plateau
  }

  // 2. 30 vs 60 days heuristic (Volume/Consistency approach)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  
  const recentSets = sorted.filter(s => new Date(s.date).getTime() >= thirtyDaysAgo);
  const previousSets = sorted.filter(s => {
    const t = new Date(s.date).getTime();
    return t >= sixtyDaysAgo && t < thirtyDaysAgo;
  });

  if (recentSets.length >= 3 && previousSets.length >= 2) {
    const recentMax = Math.max(...recentSets.map(s => calculateE1RM(s.weight_kg, s.reps, s.rir)));
    const previousMax = Math.max(...previousSets.map(s => calculateE1RM(s.weight_kg, s.reps, s.rir)));

    if (recentMax <= previousMax * PLATEAU_TOLERANCE_MULTIPLIER) {
      return true; // Possible plateau
    }
  }

  return false;
}