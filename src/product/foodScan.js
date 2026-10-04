// Client-side helpers for the food scanner: image downscaling, error mapping
// and capping what is persisted. Pure functions are exported for unit tests.

export const MAX_EDGE = 1600;
// Vercel rejects bodies over 4.5 MB; the JSON wrapper is tiny, so keep the base64 under ~3.3 MB.
export const MAX_DATA_URI_CHARS = 3_300_000;
export const MAX_SOURCE_BYTES = 30_000_000;

export function fitWithin(width, height, max = MAX_EDGE) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const loadBitmap = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('decode')); image.src = url; });
  } finally { URL.revokeObjectURL(url); }
};

/** Downscale to <=1600px JPEG q0.8, tightening until the data URI fits the upload budget. */
export async function prepareMealImage(file) {
  const bitmap = await loadBitmap(file);
  const naturalWidth = bitmap.width || bitmap.naturalWidth; const naturalHeight = bitmap.height || bitmap.naturalHeight;
  const attempts = [[MAX_EDGE, 0.8], [1280, 0.72], [1024, 0.65], [800, 0.6]];
  for (const [edge, quality] of attempts) {
    const { width, height } = fitWithin(naturalWidth, naturalHeight, edge);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); // flatten transparency for JPEG
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUri = canvas.toDataURL('image/jpeg', quality);
    if (dataUri.length <= MAX_DATA_URI_CHARS) { bitmap.close?.(); return { dataUri, width, height }; }
  }
  bitmap.close?.();
  throw Object.assign(new Error('Image too large after compression.'), { code: 'image_too_large' });
}

const MESSAGES = {
  invalid_format: 'That file is not a supported photo. Use a JPEG, PNG or WebP image.',
  image_too_large: 'That photo is too large to analyze, even after shrinking it. Try a smaller image or take a new photo.',
  image_corrupt: 'That image looks damaged or unreadable. Try a different photo.',
  rate_limited: 'You have scanned a lot of meals in a short time. Wait a minute, then try again.',
  provider_malformed: 'The scanner could not turn that photo into a usable estimate. Try a clearer photo with the whole plate in view, or enter the meal manually.',
  provider_error: 'The food scanner is having trouble right now. Try again in a moment, or enter the meal manually.',
  provider_timeout: 'The scanner took too long to respond. Try again, or enter the meal manually.',
  not_configured: 'The food scanner is not available on this deployment. You can still enter meals manually.',
  unauthorized: 'Your session has expired. Sign in again to scan meals.',
  offline: 'You appear to be offline. Reconnect and try again.',
};
export const RETRYABLE = new Set(['rate_limited', 'provider_malformed', 'provider_error', 'provider_timeout', 'offline']);

export function scanErrorMessage(code, fallback) {
  return MESSAGES[code] || fallback || 'This meal could not be analyzed. Try again, or enter it manually.';
}

/** Map an HTTP failure (status + parsed body) to a stable error code. */
export function scanErrorCode(status, body) {
  if (body && typeof body.code === 'string') return body.code;
  if (status === 413) return 'image_too_large';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 504 || status === 408) return 'provider_timeout';
  return 'provider_error';
}

const clip = (value, max) => String(value ?? '').slice(0, max);

/** Compact, bounded copy of the model analysis (the table caps analysis at 20 kB). */
export function capAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return null;
  const capped = {
    detectedFoods: (analysis.detectedFoods || []).slice(0, 10).map((item) => clip(item, 80)),
    items: (analysis.items || []).slice(0, 12).map((item) => ({ name: clip(item.name, 80), estimatedPortion: clip(item.estimatedPortion, 80), caloriesRange: clip(item.caloriesRange, 24) })),
    caloriesRange: clip(analysis.caloriesRange, 24), proteinRange: clip(analysis.proteinRange, 24), carbsRange: clip(analysis.carbsRange, 24), fatRange: clip(analysis.fatRange, 24),
    confidence: ['High', 'Medium', 'Low'].includes(analysis.confidence) ? analysis.confidence : null,
    followUpQuestion: analysis.followUpQuestion ? clip(analysis.followUpQuestion, 300) : null,
    assumptions: cappedAssumptions(analysis.assumptions),
    estimate: true,
  };
  if (JSON.stringify(capped).length > 15_000) capped.items = [];
  return capped;
}

export function cappedAssumptions(assumptions) {
  return (Array.isArray(assumptions) ? assumptions : []).slice(0, 10).map((item) => clip(item, 200));
}

/** "300-450" -> 375. Anything unparseable is 0 (the user must fill it in). */
export function rangeMidpoint(value) {
  const match = String(value ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/);
  if (match) return Math.round((Number(match[1]) + Number(match[2])) / 2);
  const single = Number(String(value ?? '').trim());
  return Number.isFinite(single) && String(value ?? '').trim() !== '' ? Math.round(single) : 0;
}
