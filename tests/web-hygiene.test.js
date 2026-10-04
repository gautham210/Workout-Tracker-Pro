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
