import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('web client has no hardcoded Supabase credentials', () => {
  const src = readFileSync('src/lib/supabase.js', 'utf8');
  assert.doesNotMatch(src, /supabase\.co|sb_publishable_/);
});

test('web manifest icons exist and include 192/512 PNG', () => {
  const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'));
  for (const icon of manifest.icons) assert.ok(existsSync(`public${icon.src}`), icon.src);
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some((i) => i.sizes === size && i.type === 'image/png'));
});

test('vercel.json caps function duration and keeps routes', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(cfg.functions['api/*.js'].maxDuration, 30);
  assert.equal(cfg.routes.length, 3);
});

// The API layer had genuinely good controls (bearer auth before any work, provider-secret
// redaction, exact-match CORS allowlist, fail-closed rate limiting) but none of them were
// protected by response headers, so a single XSS bypassed all of it.
test('every response carries the baseline security headers', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const global = cfg.headers.find((h) => h.source === '/(.*)');
  assert.ok(global, 'vercel.json must define a catch-all header block');

  const headers = Object.fromEntries(global.headers.map((h) => [h.key.toLowerCase(), h.value]));
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(headers['referrer-policy'], /strict-origin/);
  assert.match(headers['strict-transport-security'], /max-age=\d+/);

  const csp = headers['content-security-policy'];
  assert.ok(csp, 'a Content-Security-Policy is required');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  // The app talks to Supabase over https and wss from the browser.
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.supabase\.co/);
  assert.match(csp, /connect-src[^;]*wss:\/\/\*\.supabase\.co/);
  // Google Fonts are loaded from index.html.
  assert.match(csp, /style-src[^;]*fonts\.googleapis\.com/);
  // Exercise art is inlined as data: URIs; food previews are data: too.
  assert.match(csp, /img-src[^;]*data:/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, 'inline scripts must not be allowed');
});

test('API responses are never cacheable', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const api = cfg.headers.find((h) => h.source === '/api/(.*)');
  assert.ok(api, 'api/* must have its own header block');
  const cache = api.headers.find((h) => h.key.toLowerCase() === 'cache-control');
  assert.equal(cache?.value, 'no-store');
});

test('CI runs tests, lint, build, mobile typecheck and a secret scan', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const step of ['npm run lint', 'npm test', 'npm run build', 'typecheck:mobile', 'npm audit', 'gitleaks']) {
    assert.ok(ci.includes(step), `CI must run: ${step}`);
  }
});

test('the dependency-override seam is not reachable from a production handler', () => {
  for (const handler of ['ai-chat.js', 'parse-food.js', 'parse-workout.js']) {
    const src = readFileSync(`api/${handler}`, 'utf8');
    assert.doesNotMatch(src, /export \{ __setDeps/, `${handler} must not re-export the test seam`);
  }
  const deps = readFileSync('api/_deps.js', 'utf8');
  assert.match(deps, /NODE_ENV === 'production'/, '_deps must refuse overrides in production');
});
