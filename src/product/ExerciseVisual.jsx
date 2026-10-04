import { memo, useState } from 'react';
import { exerciseIdentity } from './exerciseMetadata';
import { exercisePhotoUrl, exerciseSceneUrl } from './exerciseArt';

// Layering guarantees an exercise is never blank or a broken image: the drawn
// movement scene (an inline data URI, so it cannot fail to load) is always the
// base layer, and a bundled photograph fades in over it only once it decodes.
function ExerciseVisual({ name = 'Movement', muscle, exercise, compact = false }) {
  const identity = exerciseIdentity(exercise || { name, muscle_group: muscle });
  const photo = exercisePhotoUrl(identity.art.photo);
  const [photoState, setPhotoState] = useState('loading');
  const showPhoto = photo && photoState !== 'failed';
  const visualLabel = identity.primary_muscles?.[0] || muscle || 'Training movement';
  return <div className={`exercise-visual ${photo && photoState === 'loaded' ? 'has-stitch-art' : 'has-exercise-scene'} ${compact ? 'is-compact' : ''}`} aria-label={`${identity.name || name} — ${visualLabel}`} role="img">
    <img className="exercise-scene-layer" src={exerciseSceneUrl(identity.art.scene)} alt="" aria-hidden="true" decoding="async" draggable="false" />
    {showPhoto && <img className={`exercise-photo-layer ${photoState === 'loaded' ? 'is-loaded' : ''}`} src={photo} alt="" loading="lazy" decoding="async" draggable="false" width="512" height="279" onLoad={() => setPhotoState('loaded')} onError={() => setPhotoState('failed')} />}
    <span className="exercise-visual-badge">{visualLabel}</span>
  </div>;
}

export default memo(ExerciseVisual);
