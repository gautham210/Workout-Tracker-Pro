import { getDb } from './db';
import { calculateE1RM, detectPRs, isPlateauing } from './progression';

/**
 * Builds a deterministic context based strictly on the user's actual local SQLite training history.
 * Does NOT invent data.
 */
export async function buildAICoachContext(userId: string): Promise<any> {
  try {
    const db = await getDb();
    
    // 1. RECENT WORKOUTS & FREQUENCY (Last 14 days)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = await db.getAllAsync<any>(
      `SELECT * FROM workout_sessions WHERE user_id = ? AND is_finished = 1 AND date >= ? ORDER BY date DESC`,
      [userId, twoWeeksAgo]
    );

    const recentSessions = [];
    for (const session of sessions) {
      const seRows = await db.getAllAsync<any>(
        `SELECT se.id, e.name FROM session_exercises se LEFT JOIN exercises e ON se.exercise_id = e.id WHERE se.session_id = ?`,
        [session.id]
      );
      
      const sessionExercises = [];
      for (const se of seRows) {
        const sets = await db.getAllAsync<any>(
          `SELECT weight_kg, reps, rpe, rir FROM sets WHERE session_exercise_id = ? AND completed = 1`,
          [se.id]
        );
        if (sets.length > 0) {
          sessionExercises.push({
            name: se.name,
            sets: sets.map(s => `${s.weight_kg}kg x ${s.reps} (RPE: ${s.rpe || '-'})`)
          });
        }
      }
      
      if (sessionExercises.length > 0) {
        recentSessions.push({
          date: session.date,
          split: session.split_day,
          duration: session.duration_minutes,
          exercises: sessionExercises
        });
      }
    }

    // 2. EXERCISE PROGRESSION & PRs (Last 60 days)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    
    // We only pull progressions for exercises performed in the last 14 days to keep context small
    const recentExerciseNames = [...new Set(recentSessions.flatMap(s => s.exercises.map((e: any) => e.name)))];
    
    const exerciseProgression: any[] = [];
    
    for (const exName of recentExerciseNames.slice(0, 5)) { // Max 5 exercises to prevent prompt explosion
      // Get all sets for this exercise in last 60 days
      const setsRows = await db.getAllAsync<any>(
        `SELECT s.id, s.weight_kg, s.reps, s.rir, s.rpe, ws.date, se.exercise_id 
         FROM sets s
         JOIN session_exercises se ON s.session_exercise_id = se.id
         JOIN exercises e ON se.exercise_id = e.id
         JOIN workout_sessions ws ON se.session_id = ws.id
         WHERE e.name = ? AND ws.user_id = ? AND s.completed = 1 AND ws.date >= ?
         ORDER BY ws.date ASC`,
        [exName, userId, sixtyDaysAgo]
      );

      if (setsRows.length > 0) {
        const prs = detectPRs(setsRows);
        const plateau = isPlateauing(setsRows);
        
        // Find latest e1RM
        const latestSets = setsRows.filter((s: any) => new Date(s.date).getTime() >= Date.now() - 14 * 24 * 60 * 60 * 1000);
        let currentE1RM = 0;
        if (latestSets.length > 0) {
          currentE1RM = Math.max(...latestSets.map((s: any) => calculateE1RM(s.weight_kg, s.reps, s.rir)));
        }

        exerciseProgression.push({
          exercise: exName,
          recentE1RM: Math.round(currentE1RM * 10) / 10,
          recentPRs: prs.slice(-2).map((pr: any) => ({
            type: pr.prType,
            weight: pr.weight_kg,
            reps: pr.reps,
            date: pr.date
          })),
          possiblePlateau: plateau
        });
      }
    }

    return {
      trainingSummary: {
        recentSessionsCount: recentSessions.length,
        timeframe: 'Last 14 days',
      },
      recentSessions: recentSessions.slice(0, 3), // Only send the last 3 to keep prompt tight
      exerciseProgression
    };
  } catch (error) {
    console.error('Failed to build AI context', error);
    return null;
  }
}
