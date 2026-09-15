import { supabase } from './supabase';

export interface ProgressionRecommendation {
  recommendedWeight: string;
  recommendedReps: string;
  reason: string;
}

/**
 * Analyzes previous exercise history for the current user and returns a progression recommendation.
 */
export async function getProgressionRecommendation(
  userId: string,
  exerciseId: string
): Promise<ProgressionRecommendation> {
  if (!userId || !exerciseId || exerciseId.startsWith('custom-')) {
    return {
      recommendedWeight: '',
      recommendedReps: '10',
      reason: 'No previous history. Target 10 reps.'
    };
  }

  try {
    const { data: seRows, error } = await supabase
      .from('session_exercises')
      .select('id, sets(weight_kg, reps), workout_sessions!inner(user_id, date)')
      .eq('workout_sessions.user_id', userId)
      .eq('exercise_id', exerciseId)
      .order('workout_sessions.date', { foreignTable: 'workout_sessions', ascending: false })
      .limit(1);

    if (error || !seRows || seRows.length === 0) {
      return {
        recommendedWeight: '',
        recommendedReps: '10',
        reason: 'No previous history. Target 10 reps.'
      };
    }

    const sets = seRows[0].sets ?? [];
    if (sets.length === 0) {
      return {
        recommendedWeight: '',
        recommendedReps: '10',
        reason: 'No previous sets logged. Target 10 reps.'
      };
    }

    let maxWeight = 0;
    let repsAtMax = 0;
    let allRepsAbove10 = true;
    let anyRepsBelow8 = false;
    let completedSetsCount = 0;

    (sets as any[]).forEach(s => {
      const w = parseFloat(s.weight_kg) || 0;
      const r = parseInt(s.reps, 10) || 0;
      if (r > 0) {
        completedSetsCount++;
        if (w > maxWeight) {
          maxWeight = w;
          repsAtMax = r;
        } else if (w === maxWeight && r > repsAtMax) {
          repsAtMax = r;
        }
        if (r < 10) allRepsAbove10 = false;
        if (r < 8) anyRepsBelow8 = true;
      }
    });

    if (completedSetsCount === 0) return { recommendedWeight: "10", recommendedReps: "10", reason: "No logged sets." };
    
    let nextWeight = maxWeight;
    let nextReps = repsAtMax;
    let reason = "Maintain weight and aim for more reps.";

    if (allRepsAbove10 && completedSetsCount >= 3) {
      nextWeight += 2.5;
      nextReps = 8;
      reason = "Great consistency! Progressive overload by increasing weight.";
    } else if (anyRepsBelow8) {
      nextWeight = Math.max(0, nextWeight - 2.5);
      nextReps = 10;
      reason = "Struggling with reps. Drop weight to improve volume.";
    }

    return {
      recommendedWeight: nextWeight.toString(),
      recommendedReps: nextReps.toString(),
      reason
    };
  } catch (error) {
    return { recommendedWeight: "10", recommendedReps: "10", reason: "Error computing progression." };
  }
}