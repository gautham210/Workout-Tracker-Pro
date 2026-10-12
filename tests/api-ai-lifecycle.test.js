import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import aiChat from '../api/ai-chat.js';
import parseWorkout from '../api/parse-workout.js';
import { __setDeps, __resetDeps } from '../api/_deps.js';

const CATALOG = [
  { id: 'ex-1', name: 'Barbell Bench Press', aliases: ['bench press'] },
  { id: 'ex-2', name: 'Barbell Row', aliases: ['row'] },
];

function fakeRes() {
  return {
    statusCode: null, payload: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function call(handler, body, token = 'good') {
  const res = fakeRes();
  await handler(
    { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body },
    res,
  );
  return res;
}

let clientOptions;
let createPayloads;
let replies;
let catalogError;
let logged;
const savedEnv = {};

function installDeps() {
  clientOptions = [];
  createPayloads = [];
  replies = [];
  catalogError = null;
  logged = [];
  const realError = console.error;
  const realWarn = console.warn;
  console.error = (...a) => { logged.push(a.map(String).join(' ')); realError(...a); };
  console.warn = (...a) => { logged.push(a.map(String).join(' ')); realWarn(...a); };

  __setDeps({
    authenticate: async () => ({ user: { id: 'u1' }, error: null, status: 200 }),
    databaseClient: () => ({
      from() {
        const chain = {
          select: () => chain,
          order: () => chain,
          limit: async () => (catalogError ? { data: null, error: catalogError } : { data: CATALOG, error: null }),
        };
        return chain;
      },
    }),
    consumeRequestQuota: async () => ({ allowed: true, retryAfterSeconds: 5, unavailable: false }),
    loadAthleteContext: async () => ({ profile: { name: 'Ada' } }),
    createAiClient: (options) => {
      clientOptions.push(options);
      return {
        chat: { completions: { create: async (payload) => {
          createPayloads.push(payload);
          const next = replies.shift();
          if (next instanceof Error) throw next;
          if (typeof next === 'function') return next(payload);
          return { choices: [{ message: { content: next } }] };
        } } },
      };
    },
  });
}

beforeEach(() => {
  for (const key of ['NVIDIA_API_KEY', 'OPENAI_API_KEY']) savedEnv[key] = process.env[key];
  process.env.NVIDIA_API_KEY = 'test-key';
  delete process.env.OPENAI_API_KEY;
  installDeps();
});

afterEach(() => {
  __resetDeps();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

const chatBody = { messages: [{ role: 'user', content: 'Build me a pull day' }] };
const planJson = JSON.stringify({
  message: 'Here you go.', intent: 'workout_generation',
  workoutPlan: { title: 'Pull', goal: 'Hypertrophy', exercises: [{ name: 'Barbell Row', sets: 3, repsMin: 6, repsMax: 10, rir: 2, rpe: 8, restSeconds: 90, weightKg: 60, warmup: false }] },
});

// ---------- retry amplification ----------
// The OpenAI SDK defaults to maxRetries: 2. Left unset, one client request could produce
// three billable completions (parse-workout: six with its own retry loop).
test('ai-chat never lets the SDK retry behind our back', async () => {
  replies.push(planJson);
  await call(aiChat, chatBody);
  assert.equal(clientOptions.length, 1);
  assert.equal(clientOptions[0].maxRetries, 0, 'ai-chat must pin maxRetries: 0');
});

test('parse-workout never lets the SDK retry behind our back', async () => {
  replies.push(JSON.stringify({ split: 'Pull', exercises: [{ name: 'Barbell Row', sets: [{ weight_kg: 60, reps: 8 }] }] }));
  await call(parseWorkout, { rawText: 'Row 60kg x 8' });
  assert.equal(clientOptions.length, 1);
  assert.equal(clientOptions[0].maxRetries, 0, 'parse-workout must pin maxRetries: 0');
});

test('a failing provider is called at most once per parse attempt', async () => {
  replies.push(new Error('upstream 500'), new Error('upstream 500'));
  const res = await call(parseWorkout, { rawText: 'Bench press 60kg x 8' });
  assert.equal(createPayloads.length, 2, 'exactly the two bounded attempts, no SDK fan-out');
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.source, 'fallback', 'must report the deterministic fallback, not AI output');
});

// ---------- cancellable, non-orphaned provider work ----------
test('parse-workout passes an AbortSignal so provider work can be cancelled', async () => {
  replies.push(JSON.stringify({ split: 'Pull', exercises: [{ name: 'Barbell Row', sets: [{ weight_kg: 60, reps: 8 }] }] }));
  await call(parseWorkout, { rawText: 'Row 60kg x 8' });
  assert.ok(createPayloads[0].signal, 'provider request must receive an AbortSignal');
  assert.equal(typeof createPayloads[0].signal.addEventListener, 'function');
});

test('parse-workout aborts provider work on timeout instead of racing a leaked timer', async () => {
  const savedTimeout = process.env.AI_PROVIDER_TIMEOUT_MS;
  process.env.AI_PROVIDER_TIMEOUT_MS = '60';
  // Fresh module instance so the shortened budget is picked up at import time.
  const parseWorkoutShort = (await import('../api/parse-workout.js?short=1')).default;
  __setDeps({});

  let observed = null;
  __setDeps({
    authenticate: async () => ({ user: { id: 'u1' }, error: null, status: 200 }),
    databaseClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
    consumeRequestQuota: async () => ({ allowed: true, retryAfterSeconds: 5, unavailable: false }),
    loadAthleteContext: async () => ({}),
    createAiClient: () => ({
      chat: { completions: { create: (payload) => {
        observed = payload.signal;
        return new Promise((resolve, reject) => {
          payload.signal.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      } } },
    }),
  });

  // AbortSignal.timeout uses an unref'd timer, so an otherwise-idle test process would exit
  // before it fires. A real HTTP request keeps the loop alive in production; hold it here too.
  const hold = setTimeout(() => {}, 5000);
  const started = Date.now();
  let res;
  try {
    res = await call(parseWorkoutShort, { rawText: 'Bench press 60kg x 8' });
  } finally {
    clearTimeout(hold);
    if (savedTimeout === undefined) delete process.env.AI_PROVIDER_TIMEOUT_MS;
    else process.env.AI_PROVIDER_TIMEOUT_MS = savedTimeout;
  }
  const elapsed = Date.now() - started;

  assert.ok(observed, 'provider request must be given a signal');
  assert.equal(observed.aborted, true, 'the provider request must actually be aborted');
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.source, 'fallback', 'an aborted provider call must not be reported as AI output');
  assert.ok(elapsed < 5000, `handler must not outlive the function budget (took ${elapsed}ms)`);
});

// ---------- truthful failures ----------
// loadCatalog used to swallow database errors and return [], which made `grounded` true
// with an empty index: every plan was silently dropped and the user was told no exercise
// matched, with HTTP 200 and nothing in the logs.
test('ai-chat reports an unavailable catalogue instead of pretending nothing matched', async () => {
  catalogError = { message: 'column exercises.aliases does not exist' };
  replies.push(planJson);

  const res = await call(aiChat, chatBody);

  assert.equal(res.statusCode, 503, 'a broken catalogue is a server fault, not an empty result');
  assert.equal(res.payload.workoutPlan, undefined);
  assert.ok(
    logged.some((line) => /catalogue|catalog/i.test(line)),
    'the catalogue failure must be observable in logs',
  );
});

test('ai-chat still answers prose questions when the catalogue is unavailable is not silently allowed', async () => {
  catalogError = { message: 'boom' };
  const res = await call(aiChat, chatBody);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.text, undefined);
});

// ---------- output hardening ----------
// validateCoachResponse strips control characters; validateWorkoutParse did not, so a
// U+202E RIGHT-TO-LEFT OVERRIDE in model output could reach the UI and visually impersonate
// a different movement name.
test('parse-workout strips control and bidi characters from parsed movement names', async () => {
  replies.push(JSON.stringify({
    split: 'Pull',
    exercises: [{ name: 'Barbell Row‮kcin', sets: [{ weight_kg: 60, reps: 8 }] }],
  }));

  const res = await call(parseWorkout, { rawText: 'Row 60kg x 8' });
  const name = res.payload.exercises[0].name;

  assert.ok(!/[\u200b-\u200f\u202a-\u202e\u2060-\u2064]/.test(name), `bidi/control characters survived: ${JSON.stringify(name)}`);
});

test('parse-workout strips control characters from the split and ambiguous labels too', async () => {
  replies.push(JSON.stringify({
    split: 'Pull‮',
    exercises: [{ name: 'Barbell Row', sets: [{ weight_kg: 60, reps: 8 }] }],
    ambiguous: [{ raw: 'Curd‮ der', options: ['Barbell Row'] }],
  }));

  const res = await call(parseWorkout, { rawText: 'Row 60kg x 8' });
  const serialised = JSON.stringify(res.payload);
  assert.ok(!/[\u200b-\u200f\u202a-\u202e]/.test(serialised), 'control characters survived into the response');
});

// ---------- response hygiene ----------
test('AI responses are never cached by intermediaries', async () => {
  replies.push(planJson);
  const res = await call(aiChat, chatBody);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('parse-workout responses are never cached by intermediaries', async () => {
  replies.push(JSON.stringify({ split: 'Pull', exercises: [{ name: 'Barbell Row', sets: [{ weight_kg: 60, reps: 8 }] }] }));
  const res = await call(parseWorkout, { rawText: 'Row 60kg x 8' });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

// ---------- the injection seam ----------
test('dependency overrides are refused in a production environment', async () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(
      () => __setDeps({ authenticate: async () => ({ user: { id: 'attacker' }, error: null, status: 200 }) }),
      /only permitted when NODE_ENV=test/i,
    );
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
  }
});

test('production handlers do not re-export the dependency-override seam', async () => {
  const handlers = await Promise.all([
    import('../api/ai-chat.js'),
    import('../api/parse-food.js'),
    import('../api/parse-workout.js'),
  ]);
  for (const mod of handlers) {
    assert.equal(mod.__setDeps, undefined, 'a production handler must not export __setDeps');
    assert.equal(mod.__resetDeps, undefined, 'a production handler must not export __resetDeps');
  }
});
