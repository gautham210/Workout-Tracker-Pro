// Canonical exercise knowledge shared by the web app, the Expo app and the API.
// Remote `exercises` rows stay authoritative for ids; this module owns identity
// resolution (name -> canonical record), movement metadata and which artwork an
// exercise uses. Keep it dependency-free: Vite, Metro and Node all import it.

/** photo: key of a bundled photograph in shared/exercise-art, or null to use the drawn movement scene. */
const records = [
  // key, name, aliases, pattern, group, equipment, difficulty, primary muscles, cues, common mistakes, photo
  ['barbell-bench-press', 'Barbell Bench Press', ['bench press', 'flat barbell bench press', 'bb bench'], 'horizontal_press', 'Chest', ['Barbell', 'Bench'], 'intermediate', ['Chest', 'Triceps', 'Front delts'], ['Keep shoulder blades set and feet planted.', 'Lower with control to the lower chest.'], ['Bouncing the bar', 'Flaring elbows without control'], 'bench'],
  ['incline-dumbbell-press', 'Incline Dumbbell Press', ['incline db press', 'incline press'], 'incline_press', 'Chest', ['Dumbbells', 'Bench'], 'intermediate', ['Upper chest', 'Triceps', 'Front delts'], ['Use a modest incline.', 'Keep wrists stacked over elbows.'], ['Turning the press into a shoulder press'], null],
  ['flat-dumbbell-press', 'Flat Dumbbell Press', ['flat db press', 'flat db', 'dumbbell bench press', 'db bench press'], 'horizontal_press', 'Chest', ['Dumbbells', 'Bench'], 'beginner', ['Chest', 'Triceps', 'Front delts'], ['Press in a slight arc.', 'Keep forearms vertical.'], ['Letting the dumbbells drift wide'], null],
  ['chest-fly', 'Chest Fly', ['chest flys', 'pec fly', 'dumbbell fly', 'cable fly'], 'fly', 'Chest', ['Dumbbells', 'Cable'], 'beginner', ['Chest'], ['Keep a soft bend in the elbows.', 'Stop when you feel a deep chest stretch.'], ['Turning the fly into a press'], null],
  ['push-up', 'Push-up', ['push up', 'pushup', 'push ups', 'pushups'], 'push_up', 'Chest', ['Bodyweight'], 'beginner', ['Chest', 'Triceps', 'Front delts'], ['Keep a straight line from head to heels.', 'Lower the chest between the hands.'], ['Sagging hips'], null],
  ['barbell-deadlift', 'Barbell Deadlift', ['deadlift', 'conventional deadlift'], 'hinge', 'Back', ['Barbell'], 'intermediate', ['Glutes', 'Hamstrings', 'Back'], ['Push the floor away.', 'Keep the bar close.'], ['Jerking the bar from the floor'], 'deadlift'],
  ['romanian-deadlift', 'Romanian Deadlift', ['rdl', 'stiff leg deadlift'], 'hinge', 'Legs', ['Barbell', 'Dumbbells'], 'intermediate', ['Hamstrings', 'Glutes'], ['Send hips back.', 'Keep a soft knee.'], ['Squatting the hinge'], null],
  ['pull-up', 'Pull-up', ['pull up', 'pullup', 'pull ups', 'pullups', 'weighted pull up', 'chin up', 'chinup'], 'vertical_pull', 'Back', ['Pull-up bar'], 'intermediate', ['Lats', 'Biceps'], ['Start from a controlled hang.', 'Drive elbows down.'], ['Shrugging into the shoulders'], 'pull'],
  ['lat-pulldown', 'Lat Pulldown', ['wide grip lat pulldown', 'latpulldown', 'lat pull down', 'pulldown'], 'vertical_pull', 'Back', ['Cable'], 'beginner', ['Lats', 'Biceps'], ['Keep chest tall.', 'Pull elbows to ribs.'], ['Pulling behind the neck'], null],
  ['seated-cable-row', 'Seated Cable Row', ['cable row', 'seated row', 'low row'], 'horizontal_pull', 'Back', ['Cable'], 'beginner', ['Mid back', 'Lats', 'Biceps'], ['Keep ribs stacked.', 'Pause at the torso.'], ['Rounding through the return'], null],
  ['barbell-row', 'Barbell Row', ['bent over row', 'bb row', 'bent over barbell row'], 'horizontal_pull', 'Back', ['Barbell'], 'intermediate', ['Lats', 'Mid back', 'Biceps'], ['Brace the torso.', 'Row toward the hip.'], ['Using excessive momentum'], null],
  ['overhead-press', 'Overhead Press', ['standing overhead press', 'shoulder press', 'military press', 'ohp'], 'vertical_press', 'Shoulders', ['Barbell', 'Dumbbells'], 'intermediate', ['Delts', 'Triceps'], ['Brace glutes and trunk.', 'Finish with biceps by ears.'], ['Leaning back through the lower back'], 'overhead'],
  ['lateral-raise', 'Lateral Raise', ['side raise', 'side lateral raise', 'lat raise'], 'raise', 'Shoulders', ['Dumbbells', 'Cable'], 'beginner', ['Side delts'], ['Lead with elbows.', 'Use a controlled arc.'], ['Swinging the weights'], null],
  ['reverse-fly', 'Reverse Fly', ['rear delt fly', 'reverse flys', 'rear fly'], 'raise', 'Shoulders', ['Dumbbells', 'Cable'], 'beginner', ['Rear delts'], ['Hinge forward with a flat back.', 'Lead with the elbows.'], ['Shrugging the traps'], null],
  ['bicep-curl', 'Bicep Curl', ['biceps curl', 'dumbbell curl', 'barbell curl', 'curl', 'curls'], 'curl', 'Arms', ['Dumbbells', 'Barbell', 'Cable'], 'beginner', ['Biceps'], ['Keep elbows near the ribs.', 'Control the lowering phase.'], ['Throwing hips into each rep'], null],
  ['hammer-curl', 'Hammer Curl', ['hammer curls'], 'curl', 'Arms', ['Dumbbells'], 'beginner', ['Brachialis', 'Biceps'], ['Keep palms facing in.', 'Do not swing the torso.'], ['Using momentum'], null],
  ['tricep-pushdown', 'Tricep Pushdown', ['triceps pushdown', 'cable pushdown', 'rope pushdown', 'pushdown'], 'extension', 'Arms', ['Cable'], 'beginner', ['Triceps'], ['Lock upper arms in place.', 'Finish with a controlled extension.'], ['Letting elbows drift forward'], null],
  ['overhead-tricep-extension', 'Overhead Tricep Extension', ['overhead triceps extension', 'dumbbell overhead', 'dumbell overhead', 'french press'], 'extension', 'Arms', ['Dumbbells', 'Cable'], 'beginner', ['Triceps (long head)'], ['Keep elbows pointing forward.', 'Lower to a deep stretch.'], ['Flaring the elbows'], null],
  ['barbell-squat', 'Barbell Squat', ['back squat', 'squat', 'squats'], 'squat', 'Legs', ['Barbell', 'Rack'], 'intermediate', ['Quads', 'Glutes'], ['Brace before descending.', 'Track knees over toes.'], ['Losing trunk tension'], 'squat'],
  ['leg-press', 'Leg Press', [], 'squat', 'Legs', ['Machine'], 'beginner', ['Quads', 'Glutes'], ['Keep hips supported.', 'Use a pain-free depth.'], ['Locking knees hard'], null],
  ['leg-extension', 'Leg Extension', ['leg extensions'], 'knee_extension', 'Legs', ['Machine'], 'beginner', ['Quads'], ['Squeeze at the top.', 'Control the lowering phase.'], ['Swinging the weight up'], null],
  ['leg-curl', 'Leg Curl', ['hamstring curl', 'lying leg curl', 'seated leg curl'], 'knee_flexion', 'Legs', ['Machine'], 'beginner', ['Hamstrings'], ['Control the return.', 'Keep hips anchored.'], ['Rushing the eccentric'], null],
  ['standing-calf-raise', 'Standing Calf Raise', ['calf raise', 'calf raises'], 'calf_raise', 'Legs', ['Machine', 'Bodyweight'], 'beginner', ['Calves'], ['Pause at the stretched position.', 'Finish tall.'], ['Bouncing through reps'], null],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', ['split squat', 'rear foot elevated split squat', 'lunge', 'lunges'], 'lunge', 'Legs', ['Dumbbells', 'Bench'], 'intermediate', ['Quads', 'Glutes'], ['Keep the torso tall.', 'Drop straight down.'], ['Front foot too close to the bench'], null],
  ['crunch', 'Crunch', ['crunches', 'ab crunch'], 'crunch', 'Core', ['Bodyweight'], 'beginner', ['Abs'], ['Curl the ribs toward the pelvis.', 'Keep the neck relaxed.'], ['Pulling on the neck'], null],
  ['plank', 'Plank', ['planks', 'front plank'], 'anti_extension', 'Core', ['Bodyweight'], 'beginner', ['Core'], ['Keep ribs down.', 'Squeeze glutes.'], ['Letting hips sag'], null],
  ['hanging-leg-raise', 'Hanging Leg Raise', ['hanging knee raise', 'leg raise'], 'hang_raise', 'Core', ['Pull-up bar'], 'intermediate', ['Lower abs', 'Hip flexors'], ['Avoid swinging.', 'Curl the pelvis up at the top.'], ['Using momentum'], null],
];

export const normalizeExerciseName = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const EXERCISE_CATALOG = records.map(([key, name, aliases, pattern, group, equipment, difficulty, primary, cues, mistakes, photo]) => Object.freeze({
  key, name, aliases, pattern, group, equipment, difficulty, primary_muscles: primary, form_cues: cues, common_mistakes: mistakes, photo,
}));

/** Movement patterns that have a drawn scene. */
export const MOVEMENT_PATTERNS = Object.freeze([
  'horizontal_press', 'incline_press', 'fly', 'push_up', 'vertical_pull', 'horizontal_pull', 'vertical_press', 'squat', 'lunge', 'hinge',
  'curl', 'extension', 'raise', 'knee_extension', 'knee_flexion', 'calf_raise', 'anti_extension', 'crunch', 'hang_raise', 'movement',
]);

const byLabel = new Map();
for (const entry of EXERCISE_CATALOG) {
  byLabel.set(normalizeExerciseName(entry.name), entry);
  for (const alias of entry.aliases) if (!byLabel.has(normalizeExerciseName(alias))) byLabel.set(normalizeExerciseName(alias), entry);
}
// Longest label first so "romanian deadlift" is never captured by "deadlift".
const containmentOrder = [...byLabel.keys()].filter((label) => label.length >= 5).sort((a, b) => b.length - a.length);

/** Exact name/alias match first, then the longest catalogue label contained in the name. */
export function findCatalogExercise(name) {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  const exact = byLabel.get(key);
  if (exact) return exact;
  const padded = ` ${key} `;
  const contained = containmentOrder.find((label) => padded.includes(` ${label} `));
  return contained ? byLabel.get(contained) : null;
}

export function inferMovementPattern(label, muscle) {
  const value = `${label || ''} ${muscle || ''}`.toLowerCase();
  if (/deadlift|hinge|good morning|hip thrust|romanian/.test(value)) return 'hinge';
  if (/lunge|split squat|step up/.test(value)) return 'lunge';
  if (/leg extension/.test(value)) return 'knee_extension';
  if (/leg curl|hamstring curl/.test(value)) return 'knee_flexion';
  if (/calf/.test(value)) return 'calf_raise';
  if (/squat|leg press/.test(value)) return 'squat';
  if (/pull.?up|pulldown|chin.?up/.test(value)) return 'vertical_pull';
  if (/row|face pull/.test(value)) return 'horizontal_pull';
  if (/overhead|shoulder press|military/.test(value)) return 'vertical_press';
  if (/incline/.test(value)) return 'incline_press';
  if (/push.?up/.test(value)) return 'push_up';
  if (/fly|crossover|pec deck/.test(value)) return 'fly';
  if (/press|dip/.test(value)) return 'horizontal_press';
  if (/curl/.test(value)) return 'curl';
  if (/tricep|pushdown|extension|skull/.test(value)) return 'extension';
  if (/raise|shrug/.test(value)) return 'raise';
  if (/hanging|leg raise/.test(value)) return 'hang_raise';
  if (/crunch|sit.?up/.test(value)) return 'crunch';
  if (/plank|core|\bab\b/.test(value)) return 'anti_extension';
  return 'movement';
}

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * One canonical identity for any exercise row (remote catalogue row, local row,
 * AI suggestion or imported name). `art` is the single source of truth for what
 * to draw: a bundled photo key (may be null) and an always-available scene pattern.
 */
export function resolveExercise(exercise = {}) {
  const entry = findCatalogExercise(exercise.name);
  const pattern = exercise.movement_pattern || exercise.visual_key || entry?.pattern || inferMovementPattern(exercise.name, exercise.muscle_group);
  const scene = MOVEMENT_PATTERNS.includes(pattern) ? pattern : inferMovementPattern(exercise.name, exercise.muscle_group);
  const own = (field, fallback) => (list(exercise[field]).length ? exercise[field] : fallback);
  return {
    ...exercise,
    catalog_key: entry?.key ?? null,
    aliases: list(exercise.aliases).length ? exercise.aliases : (entry?.aliases ?? []),
    equipment: own('equipment', entry?.equipment ?? []),
    movement_pattern: pattern,
    difficulty: exercise.difficulty || entry?.difficulty || 'all levels',
    primary_muscles: own('primary_muscles', entry?.primary_muscles ?? [exercise.muscle_group || entry?.group || 'Full body']),
    secondary_muscles: list(exercise.secondary_muscles),
    instructions: list(exercise.instructions),
    form_cues: own('form_cues', entry?.form_cues ?? []),
    common_mistakes: own('common_mistakes', entry?.common_mistakes ?? []),
    safety_notes: list(exercise.safety_notes),
    visual_key: scene,
    canonical_label: entry?.name ?? normalizeExerciseName(exercise.name),
    art: { photo: entry?.photo ?? null, scene },
  };
}
