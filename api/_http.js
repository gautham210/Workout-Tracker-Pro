const DEFAULT_ORIGINS = ['https://workout-tracker-pro.vercel.app', 'http://localhost:5173'];

export function setCors(req, res, methods) {
  const configured = (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ORIGINS;
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function isJsonRequest(req) {
  return typeof req.headers['content-type'] === 'string' && req.headers['content-type'].includes('application/json');
}

export function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
