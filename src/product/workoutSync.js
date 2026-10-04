import { supabase } from '../lib/supabase';
import { flushPendingWorkouts } from './pendingSync';

/** Sends one finished workout graph. Resolves `{ error }`; a timeout resolves a retryable error. */
export async function sendWorkoutGraph(graph, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { error } = await supabase.rpc('sync_workout_graph', { p_workout: graph }).abortSignal(controller.signal);
    return { error: error || null };
  } catch (error) {
    if (controller.signal.aborted) return { error: Object.assign(new Error('Saving timed out. Your workout is still here, so you can retry safely.'), { timedOut: true }) };
    return { error };
  } finally { window.clearTimeout(timer); }
}

/** Call on app load and on the `online` event. Safe to call repeatedly. */
export const syncPendingWorkouts = (userId) => flushPendingWorkouts(userId, sendWorkoutGraph);
