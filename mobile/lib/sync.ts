import { AppState } from 'react-native';
import { getDb, inFlightOutboxIds } from './db';
import { supabase } from './supabase';
import { isOfflineError } from './api';

/**
 * Sync model: every finished workout is written to the local outbox first, then pushed with ONE atomic
 * `sync_workout_graph` RPC per workout. The RPC inserts the parent session before its exercises and sets inside a
 * single database transaction and is idempotent by id, so parent/child ordering is deterministic and retries are safe.
 */
export type SyncState = 'idle' | 'local_only' | 'syncing' | 'synced' | 'retrying' | 'failed' | 'offline';

export const SYNC_LABELS: Record<SyncState, string> = {
  idle: '',
  local_only: 'Saved on this device',
  syncing: 'Syncing…',
  synced: 'All changes synced',
  retrying: 'Retrying…',
  failed: 'Sync failed',
  offline: 'Offline',
};
export const getSyncLabel = (state: SyncState) => SYNC_LABELS[state];

type StateListener = (state: SyncState) => void;
const listeners = new Set<StateListener>();
let currentState: SyncState = 'idle';
let currentUserId: string | null = null;
let offlineFlag = false;

const MAX_TRANSIENT_ATTEMPTS = 8;
const SYNCED_RETENTION_MS = 7 * 24 * 60 * 60_000;
const PERMANENT_CODES = new Set(['42501', '22023', 'P0001', '23502', '23503', '22P02', '22003', '42883', '42P01', 'PGRST202', 'PGRST204']);

function setState(state: SyncState) {
  if (currentState === state) return;
  currentState = state;
  listeners.forEach((listener) => listener(state));
}

export const getSyncState = () => currentState;

export function onSyncStateChange(callback: StateListener) {
  listeners.add(callback);
  callback(currentState);
  return () => { listeners.delete(callback); };
}

/** Clears all in-memory sync state; call on sign-out or when the signed-in user changes. */
export function resetSyncState(userId: string | null = null) {
  currentUserId = userId;
  offlineFlag = false;
  inFlightOutboxIds.clear();
  setState('idle');
}

/** Recomputes the state from the outbox for this user. Never assumes "synced" without looking. */
export async function refreshSyncState(userId: string): Promise<SyncState> {
  if (!userId) { resetSyncState(null); return currentState; }
  if (currentUserId !== userId) resetSyncState(userId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ failed: number | null; retrying: number | null; pending: number | null }>(
    `SELECT SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'pending' AND attempts > 0 THEN 1 ELSE 0 END) AS retrying,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM sync_outbox WHERE user_id = ? AND status != 'synced'`, [userId]);
  if (currentUserId !== userId) return currentState; // user changed while awaiting
  const pending = row?.pending ?? 0;
  let next: SyncState;
  if ((row?.failed ?? 0) > 0) next = 'failed';
  else if (pending > 0 && offlineFlag) next = 'offline';
  else if ((row?.retrying ?? 0) > 0) next = 'retrying';
  else if (pending > 0) next = 'local_only';
  else { offlineFlag = false; next = 'synced'; }
  setState(next);
  return next;
}

export async function getLastSyncError(userId: string): Promise<string | null> {
  if (!userId) return null;
  const db = await getDb();
  const row = await db.getFirstAsync<{ last_error: string | null }>(
    "SELECT last_error FROM sync_outbox WHERE user_id = ? AND status != 'synced' AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1", [userId]);
  return row?.last_error ?? null;
}

type Obj = Record<string, any>;
const roundOrNull = (value: unknown) => (value == null || value === '' || !Number.isFinite(Number(value)) ? null : Math.round(Number(value)));

/** Normalizes a workout for the sync RPC: whole-number duration plus optional warm-up/notes/rest fields. */
export function buildWorkoutPayload(workout: Obj): Obj {
  const exercises: Obj[] = Array.isArray(workout.exercises) ? workout.exercises : [];
  return {
    ...workout,
    duration_minutes: roundOrNull(workout.duration_minutes),
    exercises: exercises.map((exercise) => ({
      ...exercise,
      notes: exercise.notes ?? null,
      rest_seconds: roundOrNull(exercise.rest_seconds),
      sets: (Array.isArray(exercise.sets) ? exercise.sets : []).map((set: Obj) => ({
        ...set,
        is_warmup: Boolean(set.is_warmup),
        notes: set.notes ?? null,
      })),
    })),
  };
}

export async function queueCompletedWorkout(userId: string, workout: unknown) {
  const db = await getDb();
  const now = new Date().toISOString();
  const payload = buildWorkoutPayload(workout as Obj);
  const id = `workout:${payload.id}`;
  await db.runAsync(
    `INSERT INTO sync_outbox (id, user_id, operation, payload, status, attempts, last_error, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, 'sync_workout_graph', ?, 'pending', 0, NULL, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = excluded.next_attempt_at, updated_at = excluded.updated_at`,
    [id, userId, JSON.stringify(payload), now, now, now],
  );
  if (currentUserId !== userId) resetSyncState(userId);
  setState(offlineFlag ? 'offline' : 'local_only');
}

const retryDelayMs = (attempts: number) => Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7));

function isPermanentError(error: { code?: string; message?: string }) {
  return Boolean(error.code && PERMANENT_CODES.has(error.code)) || /unknown exercise/i.test(error.message ?? '');
}

async function runOnce(userId: string, force: boolean) {
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== userId) { await refreshSyncState(userId); return; }
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync("DELETE FROM sync_outbox WHERE user_id = ? AND status = 'synced' AND updated_at < ?", [userId, new Date(Date.now() - SYNCED_RETENTION_MS).toISOString()]);
  const ops = await db.getAllAsync<{ id: string; payload: string; attempts: number }>(
    `SELECT id, payload, attempts FROM sync_outbox
     WHERE user_id = ? AND (status = 'pending' OR (? = 1 AND status = 'failed')) AND (? = 1 OR next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC`, [userId, force ? 1 : 0, force ? 1 : 0, now]);
  if (!ops.length) { await refreshSyncState(userId); return; }

  setState('syncing');
  for (const op of ops) {
    if (currentUserId !== userId) return; // user switched mid-run
    inFlightOutboxIds.add(op.id);
    try {
      let payload: unknown;
      try { payload = JSON.parse(op.payload); } catch { throw Object.assign(new Error('Corrupt local workout payload'), { code: '22023' }); }
      const { error } = await supabase.rpc('sync_workout_graph', { p_workout: payload });
      if (error) throw error;
      offlineFlag = false;
      await db.runAsync("UPDATE sync_outbox SET status = 'synced', last_error = NULL, updated_at = ? WHERE id = ? AND user_id = ?", [new Date().toISOString(), op.id, userId]);
    } catch (raw) {
      const error = raw as { code?: string; message?: string };
      const message = String(error?.message ?? 'Unknown sync error').slice(0, 500);
      if (isOfflineError(raw)) {
        // No connectivity: keep the row pending and do not burn an attempt.
        offlineFlag = true;
        break;
      }
      const attempts = op.attempts + 1;
      const permanent = isPermanentError(error) || attempts >= MAX_TRANSIENT_ATTEMPTS;
      await db.runAsync(
        'UPDATE sync_outbox SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        [permanent ? 'failed' : 'pending', attempts, message, new Date(Date.now() + retryDelayMs(attempts)).toISOString(), new Date().toISOString(), op.id, userId]);
    } finally {
      inFlightOutboxIds.delete(op.id);
    }
  }
  // 'synced' is only ever reached via refreshSyncState finding zero unsynced rows.
  await refreshSyncState(userId);
}

let runPromise: Promise<void> | null = null;
let rerun = false;
let rerunForce = false;

/** Pushes pending outbox rows. Calls made while a run is active schedule another pass instead of being dropped. */
export function processOutbox(userId: string, force = false): Promise<void> {
  if (!userId) return Promise.resolve();
  if (runPromise) {
    rerun = true;
    rerunForce = rerunForce || force;
    return runPromise;
  }
  if (currentUserId !== userId) resetSyncState(userId);
  runPromise = (async () => {
    let useForce = force;
    try {
      do {
        rerun = false;
        try { await runOnce(userId, useForce); } catch (error) {
          console.warn('[sync] engine error', error);
          if (isOfflineError(error)) offlineFlag = true;
          await refreshSyncState(userId).catch(() => undefined);
        }
        useForce = rerunForce;
        rerunForce = false;
      } while (rerun);
    } finally {
      runPromise = null;
    }
  })();
  return runPromise;
}

/** Starts automatic syncing (app foreground, 30s interval, immediately). Returns a stop function. */
export function startSyncEngine(userId: string) {
  resetSyncState(userId);
  refreshSyncState(userId).catch(() => undefined);
  processOutbox(userId).catch(() => undefined);
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'active') processOutbox(userId).catch(() => undefined);
  });
  const timer = setInterval(() => { processOutbox(userId).catch(() => undefined); }, 30_000);
  return () => {
    subscription.remove();
    clearInterval(timer);
  };
}

// ---- Backward-compatible aliases for screens not yet migrated ----
/** @deprecated use SyncState. Legacy consumers receive the human label string. */
export type SyncStatus = string;
/** @deprecated use onSyncStateChange. */
export function onSyncStatusChange(callback: (status: SyncStatus) => void) {
  return onSyncStateChange((state) => callback(SYNC_LABELS[state] || SYNC_LABELS.local_only));
}
/** @deprecated use getSyncState. */
export const getSyncStatus = (): SyncStatus => SYNC_LABELS[currentState];
