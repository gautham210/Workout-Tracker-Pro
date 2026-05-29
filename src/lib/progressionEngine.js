import { supabase } from './supabase';

/**
 * Analyzes previous exercise history for the current user and returns a progression recommendation.
 * @param {string} userId - Supabase user ID
 * @param {string} exerciseId - Supabase exercise ID
 * @returns {Promise<{recommendedWeight: string, recommendedReps: string, reason: string}>}
 */
export async function getProgressionRecommendation(userId, exerciseId) {
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

    sets.forEach(s => {
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

    if (completedSetsCount === 0 || maxWeight === 0) {
      return {
        recommendedWeight: '',
        recommendedReps: '10',
        reason: 'No completed sets found. Target 10 reps.'
      };
    }

    if (allRepsAbove10) {
      const newWeight = maxWeight + 2.5;
      return {
        recommendedWeight: String(newWeight),
        recommendedReps: '8-10',
        reason: `Last session: ${maxWeight}kg × ${repsAtMax}. Reps were high (10+). Recommended overload: +2.5kg for 8-10 reps.`
      };
    } else if (anyRepsBelow8) {
      return {
        recommendedWeight: String(maxWeight),
        recommendedReps: '8-12',
        reason: `Last session: ${maxWeight}kg × ${repsAtMax}. Some reps were < 8. Keep weight same to build volume.`
      };
    } else {
      return {
        recommendedWeight: String(maxWeight),
        recommendedReps: '10',
        reason: `Last session: ${maxWeight}kg × ${repsAtMax}. Steady volume achieved. Target 10 reps.`
      };
    }
  } catch (err) {
    console.error('[PROGRESSION] Failed to generate recommendation:', err);
    return {
      recommendedWeight: '',
      recommendedReps: '10',
      reason: 'Failed to extract progression history.'
    };
  }
}
