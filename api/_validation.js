import { findCatalogExercise, normalizeExerciseName } from '../shared/exerciseCatalog.js';

const MAX_TEXT = 2_000;
const MAX_TOTAL_TEXT = 12_000;

/** Removes control characters (keeping \n and \t), zero-width/bidi overrides, and normalizes line endings. */
export function stripControlChars(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '');
}

export function validateChatMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return { error: 'messages must contain 1 to 12 entries' };
  const messages = [];
  let total = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || !['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string') {
      return { error: 'messages may contain only user or assistant text entries' };
    }
    if (entry.content.length > MAX_TEXT * 2) return { error: `each message must contain 1 to ${MAX_TEXT} characters` };
    const content = stripControlChars(entry.content).trim();
    if (!content || content.length > MAX_TEXT) return { error: `each message must contain 1 to ${MAX_TEXT} characters` };
    total += content.length;
    if (total > MAX_TOTAL_TEXT) return { error: 'conversation is too long' };
    messages.push({ role: entry.role, content });
  }
  return { value: messages };
}

/** Tolerant JSON object extraction: whole text, fenced text, then first "{" .. last "}". Returns an object or null. */
export function extractJsonObject(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* try next candidate */ }
  }
  return null;
}

/** Index of catalog rows ({id,name,aliases}) by normalized name and alias. */
export function buildCatalogIndex(catalog) {
  const byName = new Map(); const byAlias = new Map();
  for (const row of Array.isArray(catalog) ? catalog : []) {
    if (!row || row.id === undefined || row.id === null || typeof row.name !== 'string') continue;
    const nameKey = normalizeExerciseName(row.name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row);
    for (const alias of Array.isArray(row.aliases) ? row.aliases : []) {
      const key = normalizeExerciseName(alias);
      if (key && !byAlias.has(key)) byAlias.set(key, row);
    }
  }
  return { byName, byAlias };
}

const lookup = (index, key) => index.byName.get(key) || index.byAlias.get(key) || null;

/** Resolves a free-text exercise name to a real catalog row, or null. Never fabricates a row. */
export function resolveCatalogRow(name, index) {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  const direct = lookup(index, key);
  if (direct) return direct;
  const canonical = findCatalogExercise(name);
  if (!canonical) return null;
  return lookup(index, normalizeExerciseName(canonical.name))
    || canonical.aliases.map((alias) => lookup(index, normalizeExerciseName(alias))).find(Boolean) || null;
}

const coachIntents = new Set(['nutrition', 'workout_generation', 'exercise_help', 'recovery', 'progression', 'general_fitness', 'unrelated']);
const cleanLine = (value, max) => stripControlChars(value).replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Validates the model's coach reply. With a `catalog` array every exercise must resolve to a real row
 * (adds exerciseId + canonical name); unresolved names are dropped and listed in workoutPlan.unmatched.
 * Without a catalog the legacy name-only behaviour is kept.
 */
export function validateCoachResponse(value, catalog) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.message !== 'string') return null;
  const text = stripControlChars(value.message).trim().slice(0, 2800);
  if (!text) return null;
  const intent = coachIntents.has(value.intent) ? value.intent : 'general_fitness';
  const grounded = Array.isArray(catalog);
  const index = grounded ? buildCatalogIndex(catalog) : null;
  const unmatched = [];
  let workoutPlan = null;
  const plan = value.workoutPlan;
  if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
    const title = typeof plan.title === 'string' && cleanLine(plan.title, 100) ? cleanLine(plan.title, 100) : 'Suggested workout';
    const exercises = Array.isArray(plan.exercises) ? plan.exercises.slice(0, 12).flatMap((exercise) => {
      if (!exercise || typeof exercise.name !== 'string' || !exercise.name.trim()) return [];
      const rawName = cleanLine(exercise.name, 160);
      if (!rawName) return [];
      const sets = Number(exercise.sets);
      const repsMin = Number(exercise.repsMin);
      const repsMax = Number(exercise.repsMax);
      const rir = exercise.rir === null || exercise.rir === undefined ? null : Number(exercise.rir);
      const restSeconds = Number(exercise.restSeconds);
      if (!Number.isInteger(sets) || sets < 1 || sets > 10 || !Number.isInteger(repsMin) || repsMin < 1 || repsMin > 100 || !Number.isInteger(repsMax) || repsMax < repsMin || repsMax > 100 || (rir !== null && (!Number.isFinite(rir) || rir < 0 || rir > 6)) || !Number.isInteger(restSeconds) || restSeconds < 15 || restSeconds > 600) return [];
      const row = grounded ? resolveCatalogRow(rawName, index) : null;
      if (grounded && !row) { unmatched.push(rawName); return []; }
      const out = {};
      if (row) out.exerciseId = row.id;
      out.name = row ? String(row.name).slice(0, 160) : rawName;
      Object.assign(out, { sets, repsMin, repsMax, rir, restSeconds });
      const rpe = exercise.rpe;
      if (typeof rpe === 'number' && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10) out.rpe = rpe;
      const weight = exercise.weightKg;
      if (typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 500) out.weightKg = weight;
      out.warmup = exercise.warmup === true;
      out.notes = typeof exercise.notes === 'string' ? cleanLine(exercise.notes, 280) : null;
      return [out];
    }) : [];
    if (exercises.length) {
      const estimatedMinutes = Number(plan.estimatedMinutes);
      workoutPlan = {
        title,
        exercises,
        notes: typeof plan.notes === 'string' ? stripControlChars(plan.notes).trim().slice(0, 500) : null,
        estimatedMinutes: Number.isInteger(estimatedMinutes) && estimatedMinutes >= 10 && estimatedMinutes <= 240 ? estimatedMinutes : null,
        intensity: ['Easy', 'Moderate', 'Hard'].includes(plan.intensity) ? plan.intensity : null,
        target: typeof plan.target === 'string' ? cleanLine(plan.target, 100) : null,
      };
      if (typeof plan.goal === 'string' && cleanLine(plan.goal, 100)) workoutPlan.goal = cleanLine(plan.goal, 100);
      if (grounded) workoutPlan.unmatched = unmatched.slice(0, 12);
    }
  }
  const response = { text, intent, workoutPlan };
  if (grounded && !workoutPlan && unmatched.length) {
    response.text = `${text}\n\nI couldn't match any of the suggested exercises to your exercise library, so I haven't created a workout plan. Ask me again and I'll use exercises from your library.`;
    response.unmatchedExercises = unmatched.slice(0, 12);
  }
  return response;
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

const MAX_DATA_URI_CHARS = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3_500_000;
const MAX_DIMENSION = 16_384;
const saneDimensions = (width, height) => Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 && width <= MAX_DIMENSION && height <= MAX_DIMENSION;

function pngDimensions(bytes) {
  if (bytes.length < 45 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR' || bytes.readUInt32BE(8) !== 13) return null;
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  if (!bytes.subarray(bytes.length - 12).equals(iend)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes) {
  const tail = bytes.subarray(Math.max(0, bytes.length - 4096));
  if (tail.lastIndexOf(Buffer.from([0xff, 0xd9])) < 0) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // reached image data/end without a frame header
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (offset + 9 > bytes.length) return null;
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const riffEnd = bytes.readUInt32LE(4) + 8;
  if (riffEnd > bytes.length || riffEnd < 20) return null; // truncated or inconsistent
  const kind = bytes.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (kind === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/**
 * Strict image check for the food scanner. Returns { image } or { error, code, status } where code is one of
 * invalid_request | invalid_format | image_too_large | image_corrupt.
 */
export function analyzeImageDataUri(value) {
  if (typeof value !== 'string' || !value) return { error: 'Provide a JPEG, PNG, or WebP base64 image under 3.5 MB.', code: 'invalid_request', status: 400 };
  if (value.length > MAX_DATA_URI_CHARS) return { error: 'Image is too large. Use a photo under 3.5 MB.', code: 'image_too_large', status: 413 };
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return { error: 'Provide a JPEG, PNG, or WebP base64 image under 3.5 MB.', code: 'invalid_format', status: 415 };
  const [, mimeType, base64] = match;
  if (Math.floor(base64.length * 0.75) > MAX_IMAGE_BYTES) return { error: 'Image is too large. Use a photo under 3.5 MB.', code: 'image_too_large', status: 413 };
  const bytes = Buffer.from(base64, 'base64');
  const dims = bytes.length < 128 ? null
    : mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? pngDimensions(bytes)
    : mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 ? jpegDimensions(bytes)
    : mimeType === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' ? webpDimensions(bytes)
    : null;
  if (!dims || !saneDimensions(dims.width, dims.height)) return { error: 'That image looks damaged or incomplete. Try taking the photo again.', code: 'image_corrupt', status: 422 };
  return { image: { mimeType, dataUri: value, width: dims.width, height: dims.height, bytes: bytes.length } };
}
