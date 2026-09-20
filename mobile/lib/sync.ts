import { getDb } from './db';
import { supabase } from './supabase';

export type SyncStatus = 'Saved locally' | 'Syncing' | 'Synced' | 'Waiting for connection' | 'Sync failed / retrying';
type Listener = (status: SyncStatus) => void;
const listeners: Listener[] = [];
let currentStatus: SyncStatus = 'Synced';
let isSyncing = false;

export function onSyncStatusChange(callback: Listener) {
  listeners.push(callback);
  callback(currentStatus);
  return () => { const index = listeners.indexOf(callback); if (index >= 0) listeners.splice(index, 1); };
}

function updateStatus(status: SyncStatus) {
  if (currentStatus === status) return;
  currentStatus = status;
  listeners.forEach((listener) => listener(status));
}

export const getSyncStatus = () => currentStatus;

export async function queueCompletedWorkout(userId: string, workout: unknown) {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = `workout:${(workout as { id: string }).id}`;
  await db.runAsync(
    `INSERT INTO sync_outbox (id, user_id, operation, payload, status, attempts, last_error, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, 'sync_workout_graph', ?, 'pending', 0, NULL, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = 'pending', last_error = NULL, next_attempt_at = excluded.next_attempt_at, updated_at = excluded.updated_at`,
    [id, userId, JSON.stringify(workout), now, now, now],
  );
  updateStatus('Saved locally');
}

const retryDelayMs = (attempts: number) => Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7));

async function updateStatusForUser(userId: string) {
  const db = await getDb();
  const remaining = await db.getFirstAsync<{ pending: number; failed: number }>(
    "SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed FROM sync_outbox WHERE user_id = ? AND status != 'synced'", [userId],
  );
  if ((remaining?.failed ?? 0) > 0) updateStatus('Sync failed / retrying');
  else updateStatus((remaining?.pending ?? 0) > 0 ? 'Saved locally' : 'Synced');
}

/** One atomic RPC per completed workout gives deterministic parent-before-child persistence and idempotent retries. */
export async function processOutbox(userId: string, force = false) {
  if (!userId || isSyncing) return;
  isSyncing = true;
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || auth.user.id !== userId) { updateStatus('Waiting for connection'); return; }
    const db = await getDb();
    const now = new Date().toISOString();
    const ops = await db.getAllAsync<{ id: string; payload: string; attempts: number }>(
      `SELECT id, payload, attempts FROM sync_outbox
       WHERE user_id = ? AND status IN ('pending','failed') AND (? = 1 OR next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY created_at ASC`, [userId, force ? 1 : 0, now],
    );
    if (!ops.length) { await updateStatusForUser(userId); return; }
    updateStatus('Syncing');
    for (const op of ops) {
      try {
        const payload = JSON.parse(op.payload);
        const { error } = await supabase.rpc('sync_workout_graph', { p_workout: payload });
        if (error) throw new Error(error.message);
        await db.runAsync("UPDATE sync_outbox SET status = 'synced', last_error = NULL, updated_at = ? WHERE id = ? AND user_id = ?", [new Date().toISOString(), op.id, userId]);
      } catch (error) {
        const attempts = op.attempts + 1;
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown sync error';
        const nextAttempt = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
        await db.runAsync(
          "UPDATE sync_outbox SET status = 'failed', attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
          [attempts, message, nextAttempt, new Date().toISOString(), op.id, userId],
        );
        updateStatus('Sync failed / retrying');
      }
    }
    await updateStatusForUser(userId);
  } catch (error) {
    console.warn('[sync] engine error', error);
    updateStatus('Waiting for connection');
  } finally {
    isSyncing = false;
  }
}
