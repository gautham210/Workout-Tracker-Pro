import { authenticatedDatabaseClient } from './_auth.js';

const boundedText = (value, max = 100) => typeof value === 'string' ? value.slice(0, max) : null;
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;

// This is a fixed, RLS-bound context projection—not a generic database tool.
// The LLM only sees a compact fact bundle and cannot choose tables, filters, or
// another account. Individual optional tables may not exist until the additive
// migration has been applied, so each query fails closed to an empty section.
export async function loadAthleteContext(req) {
  const client = authenticatedDatabaseClient(req);
  const settled = await Promise.allSettled([
    // select(*) deliberately remains compatible while the additive migration
    // rolls through environments; the projection below still whitelists fields.
    client.from('profiles').select('*').maybeSingle(),
    client.from('athlete_preferences').select('available_equipment,preferred_exercises,excluded_exercises,nutrition_preferences').maybeSingle(),
    client.from('body_metrics_logs').select('logged_at,weight_kg,waist_cm,neck_cm,chest_cm,hips_cm').order('logged_at', { ascending: false }).limit(8),
    client.from('bodyweight_logs').select('date,weight_kg').order('date', { ascending: false }).limit(8),
    client.from('nutrition_targets').select('calories,protein_g,carbs_g,fat_g,fiber_g,water_ml,source').maybeSingle(),
    client.from('food_entries').select('logged_at,meal_type,name,calories,protein_g,carbs_g,fat_g,confidence').order('logged_at', { ascending: false }).limit(16),
    client.from('workout_sessions').select('date,split_day,duration_minutes,session_exercises(exercise_id,exercises(name,muscle_group),sets(weight_kg,reps,rpe,rir,completed))').eq('is_finished', true).order('date', { ascending: false }).limit(12),
  ]);
  const valueAt = index => settled[index]?.status === 'fulfilled' && !settled[index].value.error ? settled[index].value.data : null;
  const profile = valueAt(0) || {};
  const preferences = valueAt(1) || {};
  const metricRows = valueAt(2) || [];
  const legacyWeights = valueAt(3) || [];
  const targets = valueAt(4) || null;
  const meals = valueAt(5) || [];
  const sessions = valueAt(6) || [];
  const weight = metricRows[0]?.weight_kg ?? legacyWeights[0]?.weight_kg ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const todayMeals = meals.filter(meal => String(meal.logged_at || '').slice(0, 10) === today);
  const mealTotals = todayMeals.reduce((total, meal) => ({
    calories: total.calories + (number(meal.calories) || 0), protein_g: total.protein_g + (number(meal.protein_g) || 0), carbs_g: total.carbs_g + (number(meal.carbs_g) || 0), fat_g: total.fat_g + (number(meal.fat_g) || 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const recentSessions = sessions.map(session => ({
    date: session.date,
    split: boundedText(session.split_day, 60),
    durationMinutes: number(session.duration_minutes),
    exercises: (session.session_exercises || []).slice(0, 12).map(entry => ({
      name: boundedText(entry.exercises?.name || entry.exercise_id, 100),
      muscle: boundedText(entry.exercises?.muscle_group, 50),
      sets: (entry.sets || []).filter(set => set.completed !== false).slice(0, 12).map(set => ({ weightKg: number(set.weight_kg), reps: number(set.reps), rpe: number(set.rpe), rir: number(set.rir) })),
    })),
  }));
  return {
    profile: {
      name: boundedText(profile.name, 80), sex: profile.sex || null, heightCm: number(profile.height_cm), birthYear: number(profile.birth_year),
      goal: profile.training_goal || null, activityLevel: profile.activity_level || null, experience: profile.experience_level || null,
      preferredSessionMinutes: number(profile.preferred_session_minutes), split: Array.isArray(profile.custom_split) ? profile.custom_split.slice(0, 7).map(item => boundedText(item, 40)) : [],
    },
    preferences: {
      equipment: Array.isArray(preferences.available_equipment) ? preferences.available_equipment.slice(0, 20).map(item => boundedText(item, 50)) : [],
      preferredExercises: Array.isArray(preferences.preferred_exercises) ? preferences.preferred_exercises.slice(0, 20).map(item => boundedText(item, 100)) : [],
      excludedExercises: Array.isArray(preferences.excluded_exercises) ? preferences.excluded_exercises.slice(0, 20).map(item => boundedText(item, 100)) : [],
      nutrition: Array.isArray(preferences.nutrition_preferences) ? preferences.nutrition_preferences.slice(0, 12).map(item => boundedText(item, 80)) : [],
    },
    body: { currentWeightKg: number(weight), recent: metricRows.slice(0, 8), legacyWeightHistory: legacyWeights.slice(0, 8) },
    nutrition: { targets, today: { totals: mealTotals, mealCount: todayMeals.length }, recentMeals: meals.slice(0, 8).map(meal => ({ mealType: meal.meal_type, name: boundedText(meal.name, 100), calories: number(meal.calories), proteinG: number(meal.protein_g), confidence: meal.confidence || null })) },
    training: { sessionCount: recentSessions.length, recentSessions },
    availability: { preferences: Boolean(valueAt(1)), bodyMetrics: Boolean(valueAt(2)), nutrition: Boolean(valueAt(4) || valueAt(5)) },
  };
}
