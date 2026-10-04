/**
 * Pure body-metric formulas. This is a line-for-line port of src/lib/athleteMetrics.js so web and mobile
 * produce identical estimates. No I/O in this file.
 */
export type Sex = 'female' | 'male' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'athlete';
export type TrainingGoal = 'strength' | 'hypertrophy' | 'fat_loss' | 'maintenance' | 'general_fitness';

export const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, athlete: 1.9,
};

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' }, { value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' },
  { value: 'very_active', label: 'Very active' }, { value: 'athlete', label: 'Athlete' },
];
export const GOAL_OPTIONS: { value: TrainingGoal; label: string }[] = [
  { value: 'general_fitness', label: 'General fitness' }, { value: 'strength', label: 'Strength' }, { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'fat_loss', label: 'Fat loss' }, { value: 'maintenance', label: 'Maintenance' },
];
export const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'unspecified', label: 'Prefer not to say' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' },
];
export const goalLabel = (goal?: string | null) => GOAL_OPTIONS.find((g) => g.value === goal)?.label ?? null;
export const activityLabel = (level?: string | null) => ACTIVITY_OPTIONS.find((g) => g.value === level)?.label ?? null;

export type MetricsInput = {
  weightKg?: unknown; heightCm?: unknown; age?: unknown; sex?: unknown; waistCm?: unknown; neckCm?: unknown; hipsCm?: unknown;
  activityLevel?: unknown; goal?: unknown;
};

export type BodyMetrics = {
  bmi: number | null; bmr: number | null; tdee: number | null; targetCalories: number | null;
  proteinG: number | null; carbsG: number | null; fatG: number | null;
  bodyFatPercentage: number | null; leanMassKg: number | null; fatMassKg: number | null;
  assumptions: string[];
};

/** Mirrors the web helper: empty strings and null are "missing", not zero. */
const finite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function calculateBodyMetrics(input: MetricsInput = {}): BodyMetrics {
  const weightKg = finite(input.weightKg);
  const heightCm = finite(input.heightCm);
  const age = finite(input.age);
  const sex = input.sex === 'female' || input.sex === 'male' ? input.sex : null;
  const validWeight = weightKg && weightKg > 0 && weightKg <= 500 ? weightKg : null;
  const validHeight = heightCm && heightCm >= 80 && heightCm <= 260 ? heightCm : null;
  const validAge = age && age >= 13 && age <= 100 ? age : null;
  const bmi = validWeight && validHeight ? validWeight / ((validHeight / 100) ** 2) : null;
  const bmr = validWeight && validHeight && validAge && sex
    ? (10 * validWeight) + (6.25 * validHeight) - (5 * validAge) + (sex === 'male' ? 5 : -161)
    : null;
  const activity = activityMultipliers[input.activityLevel as ActivityLevel] || null;
  const tdee = bmr && activity ? bmr * activity : null;
  const goalAdjustment = input.goal === 'fat_loss' ? -400 : input.goal === 'hypertrophy' ? 250 : 0;
  const targetCalories = tdee ? Math.max(1200, tdee + goalAdjustment) : null;
  const waistCm = finite(input.waistCm);
  const neckCm = finite(input.neckCm);
  const hipsCm = finite(input.hipsCm);
  let bodyFatPercentage: number | null = null;
  if (validHeight && waistCm && neckCm && waistCm > neckCm) {
    if (sex === 'male') bodyFatPercentage = 495 / (1.0324 - (0.19077 * Math.log10(waistCm - neckCm)) + (0.15456 * Math.log10(validHeight))) - 450;
    if (sex === 'female' && hipsCm) bodyFatPercentage = 495 / (1.29579 - (0.35004 * Math.log10(waistCm + hipsCm - neckCm)) + (0.221 * Math.log10(validHeight))) - 450;
  }
  const safeBodyFat = bodyFatPercentage && Number.isFinite(bodyFatPercentage) && bodyFatPercentage > 2 && bodyFatPercentage < 75 ? bodyFatPercentage : null;
  const leanMassKg = safeBodyFat && validWeight ? validWeight * (1 - safeBodyFat / 100) : null;
  const fatMassKg = safeBodyFat && validWeight && leanMassKg !== null ? validWeight - leanMassKg : null;
  const proteinG = validWeight ? validWeight * (input.goal === 'hypertrophy' || input.goal === 'fat_loss' ? 2 : 1.6) : null;
  const fatG = targetCalories ? Math.max(40, (targetCalories * 0.25) / 9) : null;
  const carbsG = targetCalories && proteinG && fatG ? Math.max(0, (targetCalories - (proteinG * 4) - (fatG * 9)) / 4) : null;
  return {
    bmi, bmr, tdee, targetCalories, proteinG, carbsG, fatG,
    bodyFatPercentage: safeBodyFat, leanMassKg, fatMassKg,
    assumptions: [
      'BMR uses Mifflin–St Jeor when sex, age, height, and weight are present.',
      'Maintenance uses your selected activity multiplier; calorie and macro targets are estimates, not medical advice.',
      ...(safeBodyFat ? ['Body-fat percentage uses a US Navy circumference estimate and is not a clinical measurement.'] : []),
    ],
  };
}

export const roundMetric = (value: number | null | undefined, places = 0): number | null =>
  value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(places));

export type MetricsForm = {
  logged_at: string; weight_kg: string; height_cm: string; age: string; waist_cm: string; neck_cm: string; chest_cm: string; hips_cm: string;
  sex: Sex; activity_level: ActivityLevel; training_goal: TrainingGoal;
};

export const todayDateKey = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export const EMPTY_METRICS_FORM: MetricsForm = {
  logged_at: '', weight_kg: '', height_cm: '', age: '', waist_cm: '', neck_cm: '', chest_cm: '', hips_cm: '', sex: 'unspecified',
  activity_level: 'moderate', training_goal: 'general_fitness',
};

const parseField = (raw: string) => {
  const text = raw.trim().replace(',', '.');
  if (!text) return { empty: true as const, value: null };
  const n = Number(text);
  return { empty: false as const, value: Number.isFinite(n) ? n : NaN };
};

const RANGES: { field: keyof MetricsForm; label: string; min: number; max: number; unit: string; integer?: boolean }[] = [
  { field: 'weight_kg', label: 'Weight', min: 20, max: 500, unit: 'kg' },
  { field: 'height_cm', label: 'Height', min: 80, max: 260, unit: 'cm' },
  { field: 'age', label: 'Age', min: 13, max: 100, unit: 'years', integer: true },
  { field: 'waist_cm', label: 'Waist', min: 30, max: 250, unit: 'cm' },
  { field: 'neck_cm', label: 'Neck', min: 15, max: 120, unit: 'cm' },
  { field: 'chest_cm', label: 'Chest', min: 40, max: 250, unit: 'cm' },
  { field: 'hips_cm', label: 'Hips', min: 40, max: 250, unit: 'cm' },
];

/** Returns a map of field -> message. Height is required (matching web); every other numeric field is optional. */
export function validateMetricsForm(form: MetricsForm): Partial<Record<keyof MetricsForm, string>> {
  const errors: Partial<Record<keyof MetricsForm, string>> = {};
  for (const r of RANGES) {
    const parsed = parseField(form[r.field] as string);
    if (parsed.empty) {
      if (r.field === 'height_cm') errors[r.field] = 'Height is required to calculate estimates.';
      continue;
    }
    if (!Number.isFinite(parsed.value) || (parsed.value as number) < r.min || (parsed.value as number) > r.max) {
      errors[r.field] = `${r.label} must be between ${r.min} and ${r.max} ${r.unit}.`;
    } else if (r.integer && !Number.isInteger(parsed.value)) {
      errors[r.field] = `${r.label} must be a whole number.`;
    }
  }
  const waist = parseField(form.waist_cm).value; const neck = parseField(form.neck_cm).value;
  if (waist && neck && !errors.waist_cm && !errors.neck_cm && waist <= neck) errors.neck_cm = 'Neck should be smaller than waist.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.logged_at) || Number.isNaN(Date.parse(form.logged_at))) errors.logged_at = 'Use a date like 2026-03-27.';
  else if (form.logged_at > todayDateKey()) errors.logged_at = 'The date cannot be in the future.';
  return errors;
}

export const formToInput = (form: MetricsForm): MetricsInput => ({
  weightKg: parseField(form.weight_kg).value, heightCm: parseField(form.height_cm).value, age: parseField(form.age).value,
  sex: form.sex, waistCm: parseField(form.waist_cm).value, neckCm: parseField(form.neck_cm).value, hipsCm: parseField(form.hips_cm).value,
  activityLevel: form.activity_level, goal: form.training_goal,
});

/** Builds the exact payload keys that save_athlete_metrics reads (same shape as the web app). */
export function buildMetricsPayload(form: MetricsForm, metrics: BodyMetrics): Record<string, string | number | null> {
  const num = (raw: string) => parseField(raw).value;
  const weight = num(form.weight_kg);
  return {
    logged_at: form.logged_at,
    weight_kg: weight, height_cm: num(form.height_cm), age: num(form.age),
    waist_cm: num(form.waist_cm), neck_cm: num(form.neck_cm), chest_cm: num(form.chest_cm), hips_cm: num(form.hips_cm),
    sex: form.sex, activity_level: form.activity_level, training_goal: form.training_goal,
    target_calories: roundMetric(metrics.targetCalories), target_protein_g: roundMetric(metrics.proteinG),
    target_carbs_g: roundMetric(metrics.carbsG), target_fat_g: roundMetric(metrics.fatG),
    target_fiber_g: metrics.targetCalories ? Math.round(Math.max(25, (metrics.targetCalories / 1000) * 14)) : null,
    target_water_ml: weight ? Math.round(weight * 35) : null,
  };
}
