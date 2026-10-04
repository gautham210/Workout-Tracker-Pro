import { supabase } from './supabase';

export const API_TIMEOUT_MS = 25_000;

export async function authenticatedApiPost(path, payload, { signal, timeoutMs = API_TIMEOUT_MS } = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(path, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : `Server error (${response.status})`);
  return json;
}

/**
 * Removes every per-user local cache. Known keys are listed explicitly, and any
 * other `wtp_*` key scoped to this user id (e.g. coach threads) is swept too, so
 * new per-user keys cannot leak between accounts.
 */
export function clearUserLocalCaches(userId) {
  if (!userId || typeof localStorage === 'undefined') return;
  const known = [
    `wtp_profile_${userId}`,
    `wtp_workout_draft_v2_${userId}`,
    `wtp_coach_chat_history_${userId}`,
    `wtp_coach_chat_cache_${userId}`,
    `wtp_nutrition_journal_${userId}`,
  ];
  try {
    const swept = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Unsynced finished workouts are user data, not cache: keep them across sign-out.
      if (key && key.startsWith('wtp_') && key.includes(userId) && !key.startsWith('wtp_pending_sync_')) swept.push(key);
    }
    for (const key of new Set([...known, ...swept])) localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}
