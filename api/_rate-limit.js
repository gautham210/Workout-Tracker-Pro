// Best-effort protection for a single serverless instance.  It deliberately
// does not claim to be distributed rate limiting; production can replace it
// with a shared store without changing callers.
const buckets = new Map();

export function allowRequest(scope, subject, limit, windowMs) {
  const now = Date.now();
  const key = `${scope}:${subject}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [candidate, value] of buckets) if (value.resetAt <= now) buckets.delete(candidate);
  }
  return { allowed: bucket.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}
