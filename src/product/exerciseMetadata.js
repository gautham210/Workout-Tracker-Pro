// This resolver is deliberately deterministic.  Remote catalogue rows remain
// authoritative for identity, while this layer supplies safe presentation and
// coaching metadata when older catalogue rows have not yet been enriched.
const records = [
  ['bench press', 'horizontal_press', 'Chest', ['Barbell', 'Bench'], 'intermediate', ['Chest', 'Triceps', 'Front delts'], ['Keep shoulder blades set and feet planted.', 'Lower with control to the lower chest.'], ['Bouncing the bar', 'Flaring elbows without control']],
  ['incline dumbbell press', 'incline_press', 'Chest', ['Dumbbells', 'Bench'], 'intermediate', ['Upper chest', 'Triceps', 'Front delts'], ['Use a modest incline.', 'Keep wrists stacked over elbows.'], ['Turning the press into a shoulder press']],
  ['barbell squat', 'squat', 'Legs', ['Barbell', 'Rack'], 'intermediate', ['Quads', 'Glutes'], ['Brace before descending.', 'Track knees over toes.'], ['Losing trunk tension']],
  ['deadlift', 'hinge', 'Posterior chain', ['Barbell'], 'intermediate', ['Glutes', 'Hamstrings', 'Back'], ['Push the floor away.', 'Keep the bar close.'], ['Jerking the bar from the floor']],
  ['romanian deadlift', 'hinge', 'Hamstrings', ['Barbell', 'Dumbbells'], 'intermediate', ['Hamstrings', 'Glutes'], ['Send hips back.', 'Keep a soft knee.'], ['Squatting the hinge']],
  ['pull up', 'vertical_pull', 'Back', ['Pull-up bar'], 'intermediate', ['Lats', 'Biceps'], ['Start from a controlled hang.', 'Drive elbows down.'], ['Shrugging into the shoulders']],
  ['lat pulldown', 'vertical_pull', 'Back', ['Cable'], 'beginner', ['Lats', 'Biceps'], ['Keep chest tall.', 'Pull elbows to ribs.'], ['Pulling behind the neck']],
  ['barbell row', 'horizontal_pull', 'Back', ['Barbell'], 'intermediate', ['Lats', 'Mid back', 'Biceps'], ['Brace the torso.', 'Row toward the hip.'], ['Using excessive momentum']],
  ['seated cable row', 'horizontal_pull', 'Back', ['Cable'], 'beginner', ['Mid back', 'Lats', 'Biceps'], ['Keep ribs stacked.', 'Pause at the torso.'], ['Rounding through the return']],
  ['overhead press', 'vertical_press', 'Shoulders', ['Barbell', 'Dumbbells'], 'intermediate', ['Delts', 'Triceps'], ['Brace glutes and trunk.', 'Finish with biceps by ears.'], ['Leaning back through the lower back']],
  ['lateral raise', 'raise', 'Shoulders', ['Dumbbells', 'Cable'], 'beginner', ['Side delts'], ['Lead with elbows.', 'Use a controlled arc.'], ['Swinging the weights']],
  ['bicep curl', 'curl', 'Arms', ['Dumbbells', 'Barbell', 'Cable'], 'beginner', ['Biceps'], ['Keep elbows near the ribs.', 'Control the lowering phase.'], ['Throwing hips into each rep']],
  ['tricep pushdown', 'extension', 'Arms', ['Cable'], 'beginner', ['Triceps'], ['Lock upper arms in place.', 'Finish with a controlled extension.'], ['Letting elbows drift forward']],
  ['leg press', 'squat', 'Legs', ['Machine'], 'beginner', ['Quads', 'Glutes'], ['Keep hips supported.', 'Use a pain-free depth.'], ['Locking knees hard']],
  ['leg curl', 'knee_flexion', 'Hamstrings', ['Machine'], 'beginner', ['Hamstrings'], ['Control the return.', 'Keep hips anchored.'], ['Rushing the eccentric']],
  ['calf raise', 'calf_raise', 'Calves', ['Machine', 'Bodyweight'], 'beginner', ['Calves'], ['Pause at the stretched position.', 'Finish tall.'], ['Bouncing through reps']],
  ['plank', 'anti_extension', 'Core', ['Bodyweight'], 'beginner', ['Core'], ['Keep ribs down.', 'Squeeze glutes.'], ['Letting hips sag']],
];

const normal = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function fromRecord(name) {
  const key = normal(name);
  return records.find(([label]) => key === label || key.includes(label) || label.includes(key)) || null;
}

function inferPattern(label, muscle) {
  const value = `${label} ${muscle || ''}`.toLowerCase();
  if (/deadlift|hinge|good morning|hip thrust|romanian/.test(value)) return 'hinge';
  if (/squat|lunge|leg press|step up|extension/.test(value)) return 'squat';
  if (/pull.?up|pulldown|chin.?up/.test(value)) return 'vertical_pull';
  if (/row|face pull/.test(value)) return 'horizontal_pull';
  if (/overhead|shoulder press/.test(value)) return 'vertical_press';
  if (/press|push.?up|dip|fly/.test(value)) return 'horizontal_press';
  if (/curl/.test(value)) return 'curl';
  if (/raise/.test(value)) return 'raise';
  if (/plank|crunch|core|ab /.test(value)) return 'anti_extension';
  return 'movement';
}

export function exerciseIdentity(exercise = {}) {
  const exact = fromRecord(exercise.name);
  const [label, visualKey, defaultGroup, equipment, difficulty, primaryMuscles, cues, commonMistakes] = exact || [];
  const pattern = exercise.movement_pattern || visualKey || inferPattern(exercise.name, exercise.muscle_group);
  return {
    ...exercise,
    aliases: Array.isArray(exercise.aliases) ? exercise.aliases : [],
    equipment: Array.isArray(exercise.equipment) && exercise.equipment.length ? exercise.equipment : (equipment || []),
    movement_pattern: pattern,
    difficulty: exercise.difficulty || difficulty || 'all levels',
    primary_muscles: Array.isArray(exercise.primary_muscles) && exercise.primary_muscles.length ? exercise.primary_muscles : (primaryMuscles || [exercise.muscle_group || defaultGroup || 'Full body']),
    secondary_muscles: Array.isArray(exercise.secondary_muscles) ? exercise.secondary_muscles : [],
    instructions: Array.isArray(exercise.instructions) ? exercise.instructions : [],
    form_cues: Array.isArray(exercise.form_cues) && exercise.form_cues.length ? exercise.form_cues : (cues || []),
    common_mistakes: Array.isArray(exercise.common_mistakes) && exercise.common_mistakes.length ? exercise.common_mistakes : (commonMistakes || []),
    safety_notes: Array.isArray(exercise.safety_notes) ? exercise.safety_notes : [],
    visual_key: exercise.visual_key || pattern,
    canonical_label: label || normal(exercise.name),
  };
}

export function enrichExercises(exercises = []) { return exercises.map(exerciseIdentity); }

export const exercisePatterns = ['All', 'horizontal_press', 'vertical_press', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge', 'curl', 'raise', 'anti_extension'];
