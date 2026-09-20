import { supabase } from './supabase';

export interface Insight {
  id: string;
  type: 'progression' | 'plateau' | 'consistency' | 'imbalance' | 'trend';
  title: string;
  whatHappened: string;
  evidence: string;
  whyItMatters: string;
  whatToDoNext: string;
}

export interface NextWorkout {
  split: string;
  focus: string;
  reason: string;
  exercises?: string[];
}

/**
 * Analyzes the user's real Supabase data to generate actionable insights and a next workout recommendation.
 */
export async function generateInsights(userId: string): Promise<{ insights: Insight[], nextWorkout: NextWorkout | null }> {
  const insights: Insight[] = [];
  let nextWorkout: NextWorkout | null = null;
  
  if (!userId) return { insights, nextWorkout };

  try {
    const { data: sessions, error } = await supabase
      .from('workout_sessions')
      .select('id,date,split_day,session_exercises(exercise_id, exercises(name,muscle_group))')
      .eq('user_id', userId)
      .eq('is_finished', true)
      .order('date', { ascending: false });

    if (error) throw error;
    
    if (!sessions || sessions.length < 3) {
      insights.push({
        id: 'insufficient-data',
        type: 'trend',
        title: 'Need More Data',
        whatHappened: 'Not enough workout sessions logged yet.',
        evidence: `You have logged ${sessions?.length || 0} sessions so far.`,
        whyItMatters: 'AI Insights require a baseline of data to detect meaningful trends and patterns.',
        whatToDoNext: 'Keep tracking your workouts! We recommend logging at least 3-5 sessions before insights begin generating.',
      });
      return { insights, nextWorkout };
    }

    // Consistency Insight
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSessions = sessions.filter(s => new Date(s.date) >= thirtyDaysAgo);
    
    if (recentSessions.length < 4) {
      insights.push({
        id: 'consistency-drop',
        type: 'consistency',
        title: 'Low Workout Frequency',
        whatHappened: 'You have worked out less than once a week over the last month.',
        evidence: `You logged ${recentSessions.length} sessions in the last 30 days.`,
        whyItMatters: 'Consistency is the primary driver of adaptations. Long breaks reset muscle protein synthesis.',
        whatToDoNext: 'Try scheduling 2-3 shorter sessions per week rather than relying on motivation for long workouts.',
      });
    } else {
      insights.push({
        id: 'consistency-good',
        type: 'consistency',
        title: 'Great Consistency',
        whatHappened: 'You are consistently hitting the gym.',
        evidence: `You logged ${recentSessions.length} sessions in the last 30 days.`,
        whyItMatters: 'Regular stimulus is required for hypertrophy.',
        whatToDoNext: 'Keep up the great work and ensure you are recovering adequately.',
      });
    }

    // Imbalance Insight (Using split strings)
    const legSessions = recentSessions.filter(s => s.split_day?.toLowerCase().includes('leg')).length;
    const totalSessions = recentSessions.length;
    const legRatio = totalSessions > 0 ? legSessions / totalSessions : 0;

    if (legRatio < 0.2 && totalSessions >= 5) {
      insights.push({
        id: 'imbalance-legs',
        type: 'imbalance',
        title: 'Volume Imbalance: Legs',
        whatHappened: 'Your leg training frequency is low compared to your upper body.',
        evidence: `Leg focused sessions make up only ${(legRatio * 100).toFixed(0)}% of your recent workouts.`,
        whyItMatters: 'Neglecting leg volume can lead to asymmetrical physique development.',
        whatToDoNext: 'Consider adding a dedicated leg day or adding squat variations to your full-body days.',
      });
    }

    // Fetch Sets for Progression/Plateau analysis
    const { data: userSets, error: setsError } = await supabase
      .from('sets')
      .select(`
        id, weight_kg, reps, rpe, rir,
        session_exercises(
          exercise_id,
          workout_sessions!inner(date, user_id)
        )
      `)
      .eq('session_exercises.workout_sessions.user_id', userId)
      .eq('completed', true);

    if (!setsError && userSets) {
      const { calculateE1RM, detectPRs, isPlateauing } = await import('./progression');
      
      // Group sets by exercise_id
      const exerciseSets: Record<string, any[]> = {};
      
      for (const raw of userSets) {
        if (!raw.session_exercises) continue;
        const se = raw.session_exercises as any;
        const exId = se.exercise_id;
        if (!exerciseSets[exId]) exerciseSets[exId] = [];
        exerciseSets[exId].push({
          id: raw.id,
          date: se.workout_sessions.date,
          exercise_id: exId,
          weight_kg: raw.weight_kg,
          reps: raw.reps,
          rpe: raw.rpe,
          rir: raw.rir
        });
      }

      let plateaus = 0;
      let recentPRs = 0;

      for (const exId of Object.keys(exerciseSets)) {
        const sets = exerciseSets[exId];
        if (sets.length < 3) continue;

        const prs = detectPRs(sets);
        const recentPrsCount = prs.filter(p => new Date(p.date).getTime() >= thirtyDaysAgo.getTime()).length;
        recentPRs += recentPrsCount;

        if (isPlateauing(sets)) {
          plateaus++;
        }
      }

      if (plateaus > 0) {
        insights.push({
          id: 'progression-plateau',
          type: 'plateau',
          title: 'Possible plateau',
          whatHappened: `Progress has stalled on ${plateaus} of your exercises.`,
          evidence: `Your estimated 1RM hasn't increased by >2% in recent comparable sessions on these lifts.`,
          whyItMatters: 'If you aren\'t progressively overloading (adding weight or reps), your muscles have no reason to grow.',
          whatToDoNext: 'Try changing your rep ranges, adding an extra set, or increasing your rest times between sets.',
        });
      }

      if (recentPRs > 0) {
        insights.push({
          id: 'progression-pr',
          type: 'progression',
          title: 'Strength is Increasing',
          whatHappened: `You hit ${recentPRs} new estimated 1RM PRs in the last 30 days!`,
          evidence: `Based on your recent sets and RIR, your top end strength is trending upwards.`,
          whyItMatters: 'Consistent strength gains are the strongest indicator of muscle hypertrophy.',
          whatToDoNext: 'Ensure your nutrition is keeping up with your training to sustain this momentum.',
        });
      }
    }

    // Deterministic Next Workout Engine
    if (recentSessions.length > 0) {
      // Determine the split of the most recent session
      const lastSession = recentSessions[0];
      const lastSplit = lastSession.split_day?.toLowerCase() || 'custom';
      
      let nextSplit = 'Full Body';
      let focus = 'General Conditioning';
      let reason = 'Based on a standard rotation.';
      
      if (lastSplit.includes('push')) {
        nextSplit = 'Pull';
        focus = 'Back & Biceps';
        reason = 'Follows a standard Push-Pull-Legs rotation.';
      } else if (lastSplit.includes('pull')) {
        nextSplit = 'Legs';
        focus = 'Quads & Hamstrings';
        reason = 'Follows a standard Push-Pull-Legs rotation.';
      } else if (lastSplit.includes('leg')) {
        nextSplit = 'Push';
        focus = 'Chest, Shoulders & Triceps';
        reason = 'Follows a standard Push-Pull-Legs rotation.';
      } else if (lastSplit.includes('upper')) {
        nextSplit = 'Lower';
        focus = 'Legs & Core';
        reason = 'Follows an Upper/Lower rotation.';
      } else if (lastSplit.includes('lower')) {
        nextSplit = 'Upper';
        focus = 'Chest, Back & Arms';
        reason = 'Follows an Upper/Lower rotation.';
      } else if (lastSplit.includes('full body') || lastSplit.includes('fullbody')) {
        nextSplit = 'Full Body';
        focus = 'Total Body Hypertrophy';
        reason = 'Consistency with your full body routine.';
      } else if (legRatio < 0.2) {
        nextSplit = 'Legs';
        focus = 'Lower Body Catch-up';
        reason = 'Your lower body training volume is lagging behind your upper body.';
      } else {
        nextSplit = 'Push / Upper';
        focus = 'General Strength';
        reason = 'Based on your recent custom splits.';
      }
      
      const hoursSinceLast = (Date.now() - new Date(lastSession.date).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < 16) {
        reason = 'Take a rest day! You just trained recently.';
        nextSplit = 'Rest';
        focus = 'Recovery & Mobility';
      }

      const matchingSession = sessions.find((session) => (session.split_day || '').toLowerCase().includes(nextSplit.toLowerCase().split(' ')[0]));
      const exercises = matchingSession?.session_exercises?.map((entry: any) => entry.exercises?.name).filter(Boolean).slice(0, 8) || [];
      nextWorkout = { split: nextSplit, focus, reason, exercises };
    }

  } catch (err) {
    console.error('Error generating insights:', err);
  }

  return { insights, nextWorkout };
}
