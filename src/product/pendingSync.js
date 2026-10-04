// Finished workouts that could not reach the server (offline) wait here until a
// retry succeeds. Pure helpers: storage and the sender are injected for tests.

export const pendingKey = (userId) => `wtp_pending_sync_v1_${userId}`;

const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function getPendingWorkouts(userId, storage = defaultStorage()) {
  if (!userId || !storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(pendingKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.graph?.id) : [];
  } catch { return []; }
}

function save(userId, entries, storage) {
  try {
    if (entries.length) storage.setItem(pendingKey(userId), JSON.stringify(entries));
    else storage.removeItem(pendingKey(userId));
    return true;
  } catch { return false; }
}

/** Idempotent per graph id; returns false when storage refused the write. */
export function enqueuePendingWorkout(userId, graph, { storage = defaultStorage(), now = Date.now(), error = null } = {}) {
  if (!userId || !storage || !graph?.id) return false;
  const rest = getPendingWorkouts(userId, storage).filter((entry) => entry.graph.id !== graph.id);
  return save(userId, [...rest, { id: graph.id, queuedAt: now, attempts: 0, lastError: error, graph }], storage);
}

export function removePendingWorkout(userId, graphId, storage = defaultStorage()) {
  if (!userId || !storage) return;
  save(userId, getPendingWorkouts(userId, storage).filter((entry) => entry.graph.id !== graphId), storage);
}

export function isNetworkError(error, online = globalThis.navigator?.onLine) {
  if (online === false) return true;
  const message = String(error?.message || error || '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|offline/i.test(message);
}

/**
 * Sends queued workouts oldest first. `send(graph)` resolves `{ error }`. A network error stops the
 * run (still offline); any other error keeps that entry, records it, and continues.
 */
export async function flushPendingWorkouts(userId, send, { storage = defaultStorage(), online } = {}) {
  const entries = getPendingWorkouts(userId, storage).sort((a, b) => a.queuedAt - b.queuedAt);
  const synced = [];
  for (const entry of entries) {
    let outcome;
    try { outcome = await send(entry.graph); } catch (error) { outcome = { error }; }
    if (!outcome?.error) { removePendingWorkout(userId, entry.graph.id, storage); synced.push(entry.graph.id); continue; }
    const current = getPendingWorkouts(userId, storage).map((item) => item.graph.id === entry.graph.id ? { ...item, attempts: item.attempts + 1, lastError: String(outcome.error.message || outcome.error).slice(0, 200) } : item);
    save(userId, current, storage);
    if (isNetworkError(outcome.error, online)) break;
  }
  return { synced, remaining: getPendingWorkouts(userId, storage) };
}
