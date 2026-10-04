// Presentation/coaching metadata now lives in the canonical shared catalogue so
// the web app, the Expo app and the API resolve exercises identically.
import { resolveExercise, MOVEMENT_PATTERNS } from '../../shared/exerciseCatalog.js';

export const exerciseIdentity = resolveExercise;
export const enrichExercises = (exercises = []) => exercises.map(resolveExercise);
export const exercisePatterns = ['All', ...MOVEMENT_PATTERNS.filter((pattern) => pattern !== 'movement')];
