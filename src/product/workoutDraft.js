// Pure helpers for the browser workout draft. No React, no network: every function
// takes its storage explicitly so it can be unit-tested with a Map-backed fake.

export const draftKey = (userId) => `wtp_workout_draft_v2_${userId}`;
export const DEFAULT_REST_SECONDS = 90;

export const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);

const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export const blankSet = (over = {}) => ({ id: newId(), weight_kg: '', reps: '', rpe: '', rir: '', notes: '', is_warmup: false, completed: false, ...over });

const numberOrNull = (value) => (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));

/** Builds one session exercise. `plan` is an optional coach/import prescription. */
export function buildExercise(exercise, plan = {}) {
  const count = Math.min(10, Math.max(1, Math.round(Number(plan.sets)) || 3));
  const sets = Array.from({ length: count }, () => blankSet({
    weight_kg: plan.weightKg === null || plan.weightKg === undefined ? '' : String(plan.weightKg),
    reps: plan.reps === null || plan.reps === undefined ? '' : String(plan.reps),
    rpe: plan.rpe === null || plan.rpe === undefined ? '' : String(plan.rpe),
    rir: plan.rir === null || plan.rir === undefined ? '' : String(plan.rir),
    is_warmup: plan.warmup === true,
  }));
  return { exercise, plannedRestSeconds: Number(plan.restSeconds) || DEFAULT_REST_SECONDS, planNotes: plan.notes || null, notes: '', sets };
}

export function normaliseSessionExercise(item) {
  if (!item?.exercise?.id) return null;
  return {
    exercise: item.exercise,
    plannedRestSeconds: Number(item.plannedRestSeconds) || DEFAULT_REST_SECONDS,
    planNotes: item.planNotes || null,
    notes: typeof item.notes === 'string' ? item.notes : '',
    sets: Array.isArray(item.sets) && item.sets.length ? item.sets.map((set) => blankSet({ ...set, id: set?.id || newId() })) : [blankSet(), blankSet(), blankSet()],
  };
}

export const hasLoggedSets = (exercises = []) => exercises.some((item) => (item?.sets || []).some((set) => set.completed));
export const loggedSetCount = (exercises = []) => exercises.reduce((sum, item) => sum + (item?.sets || []).filter((set) => set.completed).length, 0);

/** Appends exercises that are not already present; never touches existing sets. */
export function mergeExercises(existing = [], incoming = []) {
  const ids = new Set(existing.map((item) => item.exercise.id));
  const added = [];
  const skipped = [];
  for (const item of incoming) {
    if (!item?.exercise?.id || ids.has(item.exercise.id)) { skipped.push(item); continue; }
    ids.add(item.exercise.id);
    added.push(item);
  }
  return { exercises: [...existing, ...added], added, skipped };
}

/** Normalises a stored draft; returns null for anything that is not this user's. */
export function parseDraft(raw, userId) {
  try {
    const draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!draft || draft.userId !== userId || !Array.isArray(draft.sessionExercises)) return null;
    const sessionExercises = draft.sessionExercises.map(normaliseSessionExercise).filter(Boolean);
    return {
      userId,
      savedAt: Number(draft.savedAt) || 0,
      phase: draft.phase === 'active' ? 'active' : 'build',
      activeIndex: Math.max(0, Math.min(Number(draft.activeIndex) || 0, Math.max(0, sessionExercises.length - 1))),
      startedAt: Number(draft.startedAt) || null,
      graphId: typeof draft.graphId === 'string' && draft.graphId ? draft.graphId : null,
      title: typeof draft.title === 'string' && draft.title.trim() ? draft.title.trim().slice(0, 100) : null,
      planNotes: draft.planNotes || null,
      sessionExercises,
    };
  } catch { return null; }
}

export function readDraft(userId, storage = defaultStorage()) {
  if (!userId || !storage) return null;
  try { return parseDraft(storage.getItem(draftKey(userId)), userId); } catch { return null; }
}

/** Returns false (instead of throwing) when storage is full or blocked. */
export function writeDraft(userId, draft, storage = defaultStorage()) {
  if (!userId || !storage) return false;
  try { storage.setItem(draftKey(userId), JSON.stringify({ ...draft, userId, savedAt: Date.now() })); return true; } catch { return false; }
}

export function clearDraft(userId, storage = defaultStorage()) {
  if (!userId || !storage) return;
  try { storage.removeItem(draftKey(userId)); } catch { /* cache cleanup is non-critical */ }
}

/** True when merging should ask first: a workout is running or sets are already logged. */
export function draftNeedsConfirm(userId, storage = defaultStorage()) {
  const draft = readDraft(userId, storage);
  return Boolean(draft && (hasLoggedSets(draft.sessionExercises) || (draft.phase === 'active' && draft.sessionExercises.length)));
}

/**
 * Merges `incoming` session exercises into the stored draft. Phase, startedAt and graphId of a
 * running workout are preserved; `startNow` only starts a draft that is not already active.
 */
export function applyToDraft(userId, incoming, { title = null, notes = null, startNow = false, storage = defaultStorage(), now = Date.now() } = {}) {
  const current = readDraft(userId, storage);
  const base = current || { phase: 'build', activeIndex: 0, startedAt: null, graphId: null, title: null, planNotes: null, sessionExercises: [] };
  const merged = mergeExercises(base.sessionExercises, incoming);
  const next = {
    ...base,
    sessionExercises: merged.exercises,
    title: base.sessionExercises.length ? (base.title || title) : (title || base.title),
    planNotes: base.planNotes || notes || null,
  };
  if (startNow && merged.exercises.length && next.phase !== 'active') {
    next.phase = 'active';
    next.startedAt = now;
    next.graphId = next.graphId || newId();
  }
  const saved = writeDraft(userId, next, storage);
  return { ...merged, saved, draft: next };
}

export const setVolume = (set) => (set.completed && !set.is_warmup ? (Number(set.weight_kg) || 0) * (Number(set.reps) || 0) : 0);
export const totalVolume = (exercises = []) => exercises.reduce((sum, item) => sum + item.sets.reduce((inner, set) => inner + setVolume(set), 0), 0);
export const workingSetCount = (exercises = []) => exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed && !set.is_warmup).length, 0);

export function splitDayLabel(title, fallback = 'Custom') {
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
  const fallbackClean = typeof fallback === 'string' && fallback.trim() ? fallback.trim() : 'Custom';
  return (clean || fallbackClean).slice(0, 100);
}

/**
 * Builds the sync_workout_graph payload. Only completed sets with reps >= 1 are sent.
 * Returns null when nothing is sendable. `graphId` must stay stable across retries.
 */
export function buildWorkoutGraph({ graphId, exercises, startedAt, title, fallbackTitle, now = Date.now() }) {
  const sendable = exercises.map((item, orderIndex) => {
    const sets = item.sets.filter((set) => set.completed && Number(set.reps) >= 1 && Number(set.weight_kg || 0) >= 0).map((set, index) => ({
      id: set.id, set_number: index + 1, weight_kg: Number(set.weight_kg) || 0, reps: Math.floor(Number(set.reps)), completed: true,
      rpe: numberOrNull(set.rpe), rir: numberOrNull(set.rir), is_warmup: set.is_warmup === true, notes: set.notes ? String(set.notes).slice(0, 500) : null,
    }));
    return {
      id: item.id || null, exercise_id: item.exercise.id, order_index: orderIndex,
      notes: item.notes ? String(item.notes).slice(0, 500) : null, rest_seconds: Number(item.plannedRestSeconds) || null, sets,
    };
  }).filter((item) => item.sets.length);
  if (!sendable.length) return null;
  const day = splitDayLabel(title, fallbackTitle);
  const start = startedAt ?? now;
  return {
    id: graphId, is_finished: true, date: new Date(start).toISOString(), split_type: 'custom', split_day: day, notes: '',
    duration_minutes: Math.max(1, Math.round((now - start) / 60_000)),
    exercises: sendable.map((item, index) => ({ ...item, id: item.id || deterministicExerciseId(graphId, index) })),
  };
}

// Exercise row ids derive from the graph id so a retried payload is byte-identical.
function deterministicExerciseId(graphId, index) {
  const hex = (graphId || '').replace(/[^0-9a-f]/gi, '').padEnd(32, '0').slice(0, 32).split('');
  const tail = (index + 1).toString(16).padStart(4, '0');
  hex.splice(28, 4, ...tail);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

/** "Chest & Triceps" style fallback when a session has no plan title. */
export function inferTitle(exercises = []) {
  const counts = new Map();
  for (const item of exercises) {
    const group = item?.exercise?.muscle_group;
    if (group) counts.set(group, (counts.get(group) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([group]) => group);
  return top.length ? top.join(' & ') : null;
}
