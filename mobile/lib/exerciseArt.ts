import type { ImageSourcePropType } from 'react-native';
import { resolveExercise, type ExerciseLike, type ResolvedExercise } from '../../shared/exerciseCatalog.js';

// Metro needs static require() calls, so each bundled photograph is listed once
// here. tests/exercise-art.test.js asserts this table matches shared/exercise-art.
const photos: Record<string, ImageSourcePropType> = {
  bench: require('../../shared/exercise-art/bench.jpg'),
  deadlift: require('../../shared/exercise-art/deadlift.jpg'),
  overhead: require('../../shared/exercise-art/overhead.jpg'),
  pull: require('../../shared/exercise-art/pull.jpg'),
  squat: require('../../shared/exercise-art/squat.jpg'),
};

export type ExerciseArt = { photo: ImageSourcePropType | null; scene: string; identity: ResolvedExercise };

export function exerciseArt(exercise: ExerciseLike): ExerciseArt {
  const identity = resolveExercise(exercise);
  return { photo: identity.art.photo ? photos[identity.art.photo] ?? null : null, scene: identity.art.scene, identity };
}
