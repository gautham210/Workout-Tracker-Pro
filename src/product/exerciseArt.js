import { exerciseSceneDataUri } from '../../shared/exerciseScenes.js';

// Bundled photographs live in shared/exercise-art and are fingerprinted by Vite,
// so they resolve in dev and production without any remote dependency.
const photos = import.meta.glob('../../shared/exercise-art/*.jpg', { eager: true, query: '?url', import: 'default' });

const photoUrls = Object.fromEntries(Object.entries(photos).map(([path, url]) => [path.split('/').pop().replace(/\.jpg$/, ''), url]));

export const exercisePhotoUrl = (key) => (key ? photoUrls[key] ?? null : null);
export const exerciseSceneUrl = exerciseSceneDataUri;
