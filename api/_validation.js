const MAX_TEXT = 2_000;

export function validateChatMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return { error: 'messages must contain 1 to 12 entries' };
  const messages = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || !['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string') {
      return { error: 'messages may contain only user or assistant text entries' };
    }
    const content = entry.content.trim();
    if (!content || content.length > MAX_TEXT) return { error: `each message must contain 1 to ${MAX_TEXT} characters` };
    messages.push({ role: entry.role, content });
  }
  return { value: messages };
}

const coachIntents = new Set(['nutrition', 'workout_generation', 'exercise_help', 'recovery', 'progression', 'general_fitness', 'unrelated']);

export function validateCoachResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.message !== 'string') return null;
  const text = value.message.trim().slice(0, 2800);
  if (!text) return null;
  const intent = coachIntents.has(value.intent) ? value.intent : 'general_fitness';
  let workoutPlan = null;
  if (value.workoutPlan && typeof value.workoutPlan === 'object' && !Array.isArray(value.workoutPlan)) {
    const title = typeof value.workoutPlan.title === 'string' ? value.workoutPlan.title.trim().slice(0, 100) : 'Suggested workout';
    const exercises = Array.isArray(value.workoutPlan.exercises) ? value.workoutPlan.exercises.slice(0, 12).flatMap((exercise) => {
      if (!exercise || typeof exercise.name !== 'string' || !exercise.name.trim()) return [];
      const sets = Number(exercise.sets);
      const repsMin = Number(exercise.repsMin);
      const repsMax = Number(exercise.repsMax);
      const rir = exercise.rir === null || exercise.rir === undefined ? null : Number(exercise.rir);
      const restSeconds = Number(exercise.restSeconds);
      if (!Number.isInteger(sets) || sets < 1 || sets > 10 || !Number.isInteger(repsMin) || repsMin < 1 || repsMin > 100 || !Number.isInteger(repsMax) || repsMax < repsMin || repsMax > 100 || (rir !== null && (!Number.isFinite(rir) || rir < 0 || rir > 6)) || !Number.isInteger(restSeconds) || restSeconds < 15 || restSeconds > 600) return [];
      return [{ name: exercise.name.trim().slice(0, 160), sets, repsMin, repsMax, rir, restSeconds, notes: typeof exercise.notes === 'string' ? exercise.notes.trim().slice(0, 280) : null }];
    }) : [];
    if (exercises.length) {
      const estimatedMinutes = Number(value.workoutPlan.estimatedMinutes);
      const intensity = ['Easy', 'Moderate', 'Hard'].includes(value.workoutPlan.intensity) ? value.workoutPlan.intensity : null;
      const target = typeof value.workoutPlan.target === 'string' ? value.workoutPlan.target.trim().slice(0, 100) : null;
      workoutPlan = {
        title,
        exercises,
        notes: typeof value.workoutPlan.notes === 'string' ? value.workoutPlan.notes.trim().slice(0, 500) : null,
        estimatedMinutes: Number.isInteger(estimatedMinutes) && estimatedMinutes >= 10 && estimatedMinutes <= 240 ? estimatedMinutes : null,
        intensity,
        target,
      };
    }
  }
  return { text, intent, workoutPlan };
}

const finiteNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validateWorkoutParse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const split = typeof value.split === 'string' ? value.split.slice(0, 80) : 'Custom';
  const date = typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : null;
  const exercises = Array.isArray(value.exercises) ? value.exercises.slice(0, 50).flatMap((exercise) => {
    if (!exercise || typeof exercise.name !== 'string') return [];
    const name = exercise.name.trim().slice(0, 160);
    const sets = Array.isArray(exercise.sets) ? exercise.sets.slice(0, 100).flatMap((set) => {
      if (!set || !finiteNumber(set.weight_kg, 0, 1000) || !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 500) return [];
      return [{ weight_kg: set.weight_kg, reps: set.reps }];
    }) : [];
    if (!name || !sets.length) return [];
    return [{ name, confidence: finiteNumber(exercise.confidence, 0, 1) ? exercise.confidence : 0.5, sets }];
  }) : [];
  const ambiguous = Array.isArray(value.ambiguous) ? value.ambiguous.slice(0, 20).flatMap((item) => {
    if (!item || typeof item.raw !== 'string' || !Array.isArray(item.options)) return [];
    const options = item.options.filter((option) => typeof option === 'string' && option.trim()).slice(0, 3).map((option) => option.trim().slice(0, 160));
    return options.length ? [{ raw: item.raw.trim().slice(0, 160), options }] : [];
  }) : [];
  return { date, split, exercises, ambiguous };
}

function range(value) {
  return typeof value === 'string' && /^\d{1,5}(?:\.\d+)?\s*-\s*\d{1,5}(?:\.\d+)?$/.test(value.trim()) ? value.trim() : null;
}

export function validateFoodAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detectedFoods = Array.isArray(value.detectedFoods) ? value.detectedFoods.filter((food) => typeof food === 'string' && food.trim()).slice(0, 12).map((food) => food.trim().slice(0, 120)) : [];
  const confidence = ['High', 'Medium', 'Low'].includes(value.confidence) ? value.confidence : null;
  const caloriesRange = range(value.caloriesRange);
  const proteinRange = range(value.proteinRange);
  const carbsRange = range(value.carbsRange);
  const fatRange = range(value.fatRange);
  if (!detectedFoods.length || !confidence || !caloriesRange || !proteinRange || !carbsRange || !fatRange) return null;
  const assumptions = Array.isArray(value.assumptions) ? value.assumptions.filter((item) => typeof item === 'string' && item.trim()).slice(0, 8).map((item) => item.trim().slice(0, 240)) : [];
  const followUpQuestion = typeof value.followUpQuestion === 'string' && value.followUpQuestion.trim() ? value.followUpQuestion.trim().slice(0, 300) : null;
  const items = Array.isArray(value.items) ? value.items.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 120) : '';
    const estimatedPortion = typeof item.estimatedPortion === 'string' ? item.estimatedPortion.trim().slice(0, 120) : '';
    const itemCalories = range(item.caloriesRange);
    const itemProtein = range(item.proteinRange);
    const itemCarbs = range(item.carbsRange);
    const itemFat = range(item.fatRange);
    if (!name || !estimatedPortion || !itemCalories || !itemProtein || !itemCarbs || !itemFat) return [];
    return [{ name, estimatedPortion, caloriesRange: itemCalories, proteinRange: itemProtein, carbsRange: itemCarbs, fatRange: itemFat }];
  }) : [];
  return { detectedFoods, items, caloriesRange, proteinRange, carbsRange, fatRange, confidence, assumptions, followUpQuestion };
}

export function validateImageDataUri(value) {
  if (typeof value !== 'string' || value.length > 5 * 1024 * 1024) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const base64 = match[2];
  const estimatedBytes = Math.floor(base64.length * 0.75);
  if (estimatedBytes < 128 || estimatedBytes > 3_500_000) return null;
  const bytes = Buffer.from(base64, 'base64');
  const validSignature = (match[1] === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8)
    || (match[1] === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (match[1] === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!validSignature) return null;
  return { mimeType: match[1], dataUri: value };
}
