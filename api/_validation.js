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
  const bounded = (low, high) => {
    const start = Number(low); const end = Number(high);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > 100000) return null;
    const format = number => Number.isInteger(number) ? String(number) : String(Number(number.toFixed(1)));
    return `${format(start)}-${format(end)}`;
  };
  if (typeof value === 'number') return bounded(value, value);
  if (Array.isArray(value) && value.length === 2) return bounded(value[0], value[1]);
  if (value && typeof value === 'object') return bounded(value.low ?? value.min ?? value.from, value.high ?? value.max ?? value.to);
  if (typeof value !== 'string') return null;
  const numbers = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  return numbers?.length === 2 ? bounded(numbers[0], numbers[1]) : numbers?.length === 1 ? bounded(numbers[0], numbers[0]) : null;
}

const first = (value, keys) => keys.map(key => value?.[key]).find(item => item !== undefined && item !== null);
const textList = value => Array.isArray(value) ? value.flatMap(item => typeof item === 'string' ? [item] : item && typeof item === 'object' ? [first(item, ['name', 'food', 'food_name', 'label'])] : []) : [];
const asStrings = value => Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
const foodRange = (value, keys, totals) => range(first(value, keys) ?? first(totals, keys));
const confidenceLabel = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'high' || text === 'medium' || text === 'low') return `${text[0].toUpperCase()}${text.slice(1)}`;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
  if (normalized < 0 || normalized > 1) return null;
  return normalized >= 0.8 ? 'High' : normalized >= 0.5 ? 'Medium' : 'Low';
};

export function parseFoodProviderResponse(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf('{'); const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const nested = [parsed.analysis, parsed.result, parsed.data, parsed.nutrition].find(value => value && typeof value === 'object' && !Array.isArray(value));
      return nested || parsed;
    } catch { /* Try the bounded JSON object candidate next. */ }
  }
  return null;
}

export function validateFoodAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rawItems = first(value, ['items', 'foodItems', 'food_items', 'foods', 'ingredients', 'detected_items']);
  const itemNames = textList(rawItems);
  const detectedFoods = [...asStrings(first(value, ['detectedFoods', 'detected_foods', 'detectedFoodsList'])), ...itemNames]
    .filter((food) => typeof food === 'string' && food.trim()).map((food) => food.trim().slice(0, 120)).filter((food, index, all) => all.indexOf(food) === index).slice(0, 12);
  const totals = first(value, ['totals', 'totalNutrition', 'total_nutrition', 'nutritionTotals', 'nutrition_totals']) || {};
  const confidence = confidenceLabel(first(value, ['confidence', 'confidence_level', 'confidenceScore', 'confidence_score']));
  const caloriesRange = foodRange(value, ['caloriesRange', 'calories_range', 'calories', 'kcal', 'estimated_calories', 'totalCalories', 'total_calories'], totals);
  const proteinRange = foodRange(value, ['proteinRange', 'protein_range', 'protein', 'protein_g', 'proteinGrams', 'totalProtein', 'total_protein'], totals);
  const carbsRange = foodRange(value, ['carbsRange', 'carbs_range', 'carbs', 'carbohydrates', 'carbohydrates_g', 'carb_g', 'totalCarbs', 'total_carbs'], totals);
  const fatRange = foodRange(value, ['fatRange', 'fat_range', 'fat', 'fats', 'fat_g', 'totalFat', 'total_fat'], totals);
  if (!detectedFoods.length || !confidence || !caloriesRange || !proteinRange || !carbsRange || !fatRange) return null;
  const assumptions = asStrings(first(value, ['assumptions', 'notes', 'analysisNotes', 'analysis_notes'])).filter((item) => typeof item === 'string' && item.trim()).slice(0, 8).map((item) => item.trim().slice(0, 240));
  const followUp = first(value, ['followUpQuestion', 'follow_up_question', 'followup', 'question']);
  const followUpQuestion = typeof followUp === 'string' && followUp.trim() ? followUp.trim().slice(0, 300) : null;
  const items = Array.isArray(rawItems) ? rawItems.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const nameValue = first(item, ['name', 'food', 'food_name', 'label']);
    const portionValue = first(item, ['estimatedPortion', 'estimated_portion', 'portion', 'serving', 'quantity', 'estimated_portion_g', 'portion_g', 'grams']);
    const name = typeof nameValue === 'string' ? nameValue.trim().slice(0, 120) : '';
    const estimatedPortion = typeof portionValue === 'string' ? portionValue.trim().slice(0, 120) : Number.isFinite(Number(portionValue)) && Number(portionValue) > 0 ? `about ${Number(portionValue)} g` : '';
    const itemCalories = range(first(item, ['caloriesRange', 'calories_range', 'calories', 'kcal', 'estimated_calories']));
    const itemProtein = range(first(item, ['proteinRange', 'protein_range', 'protein', 'protein_g', 'proteinGrams']));
    const itemCarbs = range(first(item, ['carbsRange', 'carbs_range', 'carbs', 'carbohydrates', 'carbohydrates_g', 'carb_g']));
    const itemFat = range(first(item, ['fatRange', 'fat_range', 'fat', 'fats', 'fat_g']));
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
