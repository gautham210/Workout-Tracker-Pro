const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export const activityMultipliers = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  athlete: 1.9,
};

export function calculateBodyMetrics(input = {}) {
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
  const activity = activityMultipliers[input.activityLevel] || null;
  const tdee = bmr && activity ? bmr * activity : null;
  const goalAdjustment = input.goal === 'fat_loss' ? -400 : input.goal === 'hypertrophy' ? 250 : 0;
  const targetCalories = tdee ? Math.max(1200, tdee + goalAdjustment) : null;
  const waistCm = finite(input.waistCm);
  const neckCm = finite(input.neckCm);
  const hipsCm = finite(input.hipsCm);
  let bodyFatPercentage = null;
  if (validHeight && waistCm && neckCm && waistCm > neckCm) {
    if (sex === 'male') bodyFatPercentage = 495 / (1.0324 - (0.19077 * Math.log10(waistCm - neckCm)) + (0.15456 * Math.log10(validHeight))) - 450;
    if (sex === 'female' && hipsCm) bodyFatPercentage = 495 / (1.29579 - (0.35004 * Math.log10(waistCm + hipsCm - neckCm)) + (0.221 * Math.log10(validHeight))) - 450;
  }
  const safelyRoundedBodyFat = bodyFatPercentage && Number.isFinite(bodyFatPercentage) && bodyFatPercentage > 2 && bodyFatPercentage < 75 ? bodyFatPercentage : null;
  const leanMassKg = safelyRoundedBodyFat && validWeight ? validWeight * (1 - safelyRoundedBodyFat / 100) : null;
  const fatMassKg = safelyRoundedBodyFat && validWeight ? validWeight - leanMassKg : null;
  const proteinG = validWeight ? validWeight * (input.goal === 'hypertrophy' || input.goal === 'fat_loss' ? 2 : 1.6) : null;
  const fatG = targetCalories ? Math.max(40, (targetCalories * 0.25) / 9) : null;
  const carbsG = targetCalories && proteinG && fatG ? Math.max(0, (targetCalories - (proteinG * 4) - (fatG * 9)) / 4) : null;
  return {
    bmi, bmr, tdee, targetCalories, proteinG, carbsG, fatG,
    bodyFatPercentage: safelyRoundedBodyFat, leanMassKg, fatMassKg,
    assumptions: [
      'BMR uses Mifflin–St Jeor when sex, age, height, and weight are present.',
      'Maintenance uses your selected activity multiplier; calorie and macro targets are estimates, not medical advice.',
      ...(safelyRoundedBodyFat ? ['Body-fat percentage uses a US Navy circumference estimate and is not a clinical measurement.'] : []),
    ],
  };
}

export const roundMetric = (value, places = 0) => value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(places));
