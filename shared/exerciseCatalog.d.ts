export interface CatalogExercise {
  readonly key: string;
  readonly name: string;
  readonly aliases: string[];
  readonly pattern: string;
  readonly group: string;
  readonly equipment: string[];
  readonly difficulty: string;
  readonly primary_muscles: string[];
  readonly form_cues: string[];
  readonly common_mistakes: string[];
  readonly photo: string | null;
}
export interface ExerciseLike { id?: string; name?: string | null; muscle_group?: string | null; [field: string]: unknown }
export interface ResolvedExercise extends ExerciseLike {
  catalog_key: string | null;
  aliases: string[];
  equipment: string[];
  movement_pattern: string;
  difficulty: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  instructions: string[];
  form_cues: string[];
  common_mistakes: string[];
  safety_notes: string[];
  visual_key: string;
  canonical_label: string;
  art: { photo: string | null; scene: string };
}
export const EXERCISE_CATALOG: readonly CatalogExercise[];
export const MOVEMENT_PATTERNS: readonly string[];
export function normalizeExerciseName(value: unknown): string;
export function findCatalogExercise(name: unknown): CatalogExercise | null;
export function inferMovementPattern(label?: string | null, muscle?: string | null): string;
export function resolveExercise(exercise?: ExerciseLike): ResolvedExercise;
