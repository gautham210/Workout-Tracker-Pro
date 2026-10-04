import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EDGE, capAnalysis, fitWithin, rangeMidpoint, scanErrorCode, scanErrorMessage, RETRYABLE } from '../src/product/foodScan.js';

test('fitWithin downsizes the long edge to 1600 and never upsizes', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: MAX_EDGE, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: MAX_EDGE });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(0, 10), { width: 0, height: 0 });
});

test('every documented parse-food error code has a specific message', () => {
  for (const code of ['invalid_format', 'image_too_large', 'image_corrupt', 'rate_limited', 'provider_malformed', 'provider_error', 'provider_timeout']) {
    assert.notEqual(scanErrorMessage(code), scanErrorMessage('nope'), code);
  }
  assert.ok(RETRYABLE.has('provider_timeout') && !RETRYABLE.has('invalid_format'));
  assert.equal(scanErrorCode(502, { code: 'provider_malformed' }), 'provider_malformed');
  assert.equal(scanErrorCode(413, {}), 'image_too_large');
  assert.equal(scanErrorCode(429, {}), 'rate_limited');
  assert.equal(scanErrorCode(500, null), 'provider_error');
});

test('range midpoint and analysis capping are bounded and honest', () => {
  assert.equal(rangeMidpoint('300-450'), 375);
  assert.equal(rangeMidpoint('10 – 20'), 15);
  assert.equal(rangeMidpoint('about 5'), 0);
  assert.equal(rangeMidpoint(''), 0);
  const huge = { detectedFoods: Array(50).fill('x'.repeat(500)), items: Array(100).fill({ name: 'y'.repeat(900), estimatedPortion: 'z'.repeat(900), caloriesRange: '1-2' }), confidence: 'Low', assumptions: Array(40).fill('a'.repeat(900)), caloriesRange: '1-2', proteinRange: '1-2', carbsRange: '1-2', fatRange: '1-2', followUpQuestion: 'q'.repeat(2000) };
  const capped = capAnalysis(huge);
  assert.ok(JSON.stringify(capped).length < 20_000);
  assert.equal(capped.confidence, 'Low');
  assert.equal(capped.estimate, true);
  assert.equal(capAnalysis({ confidence: 'Certain' }).confidence, null);
  assert.equal(capAnalysis(null), null);
});
