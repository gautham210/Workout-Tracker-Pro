const DEFAULT_ORIGINS = ['https://workout-tracker-pro.vercel.app', 'http://localhost:5173'];

export function setCors(req, res, methods) {
  const configured = (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ORIGINS;
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Retry-After is not a CORS-safelisted response header, so cross-origin callers cannot read
  // it unless it is explicitly exposed. Without this the client cannot show a real countdown.
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
  res.setHeader('Access-Control-Max-Age', '600');
  // These responses carry the caller's own body weight, nutrition and training history. They must
  // never be written to a shared or intermediary cache.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function isJsonRequest(req) {
  return typeof req.headers['content-type'] === 'string' && req.headers['content-type'].includes('application/json');
}

export function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Log-safe summary of an error: never includes stack traces, tokens or provider payloads. */
export function safeLogMessage(error) {
  return errorMessage(error, 'unknown').replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 200);
}
