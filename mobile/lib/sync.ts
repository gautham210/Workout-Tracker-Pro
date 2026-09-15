import { supabase } from './supabase';
import { getDb } from './db';

/**
 * Queues a mutation to be synced to Supabase later.
 * 
 * @param tableName 'workout_sessions', 'session_exercises', 'sets'
 * @param operation 'INSERT' or 'UPDATE'
 * @param payload The raw object to insert/update (should have an ID)
 */
export async function queueSyncOperation(tableName: string, operation: string, payload: any) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_outbox (id, table_name, operation, payload, created_at) VALUES (?, ?, ?, ?, ?)`,
    [payload.id, tableName, operation, JSON.stringify(payload), new Date().toISOString()]
  );
  
  // Try to sync immediately (fire and forget)
  processOutbox().catch(console.warn);
}

export type SyncStatus = 'Saved locally' | 'Syncing' | 'Synced' | 'Waiting for connection' | 'Sync failed / retrying';
let currentStatus: SyncStatus = 'Synced';
const listeners: ((status: SyncStatus) => void)[] = [];

export function onSyncStatusChange(callback: (status: SyncStatus) => void) {
  listeners.push(callback);
  callback(currentStatus);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function updateStatus(status: SyncStatus) {
  if (currentStatus !== status) {
    currentStatus = status;
    listeners.forEach(l => l(status));
  }
}

export function getSyncStatus() {
  return currentStatus;
}

let isSyncing = false;

export async function processOutbox() {
  if (isSyncing) return;
  isSyncing = true;
  
  try {
    const db = await getDb();
    const pendingOps = await db.getAllAsync<{id: string, table_name: string, operation: string, payload: string}>(
      `SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY created_at ASC`
    );
    
    if (pendingOps.length === 0) {
      updateStatus('Synced');
      isSyncing = false;
      return;
    }
    
    updateStatus('Syncing');
    
    for (const op of pendingOps) {
      try {
        const payload = JSON.parse(op.payload);
        
        let error = null;
        
        if (op.operation === 'INSERT' || op.operation === 'UPSERT') {
          // Use upsert to be duplicate-safe (idempotent)
          const { error: err } = await supabase.from(op.table_name).upsert(payload);
          error = err;
        } else if (op.operation === 'UPDATE') {
          const { error: err } = await supabase.from(op.table_name).update(payload).eq('id', payload.id);
          error = err;
        }
        
        if (error) {
          // If it's a network error, we break and stop syncing the rest of the outbox to preserve order
          console.error(`[SYNC] Failed to sync ${op.table_name} ${payload.id}:`, error.message);
          updateStatus('Sync failed / retrying');
          break;
        } else {
          // Success! Mark as synced (or delete from outbox)
          await db.runAsync(`UPDATE sync_outbox SET status = 'synced' WHERE id = ?`, [op.id]);
        }
      } catch (e) {
        console.error(`[SYNC] Corrupt payload for ${op.id}`, e);
        await db.runAsync(`UPDATE sync_outbox SET status = 'failed' WHERE id = ?`, [op.id]);
      }
    }
    
    // Check if any pending ops left
    const remainingOps = await db.getAllAsync<{id: string}>(`SELECT id FROM sync_outbox WHERE status = 'pending' LIMIT 1`);
    if (remainingOps.length === 0) {
      updateStatus('Synced');
    }

  } catch (err) {
    console.error('[SYNC] Engine error', err);
    updateStatus('Sync failed / retrying');
  } finally {
    isSyncing = false;
  }
}
