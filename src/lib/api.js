import { supabase } from './supabase';

export async function authenticatedApiPost(path, payload, { signal } = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(path, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : `Server error (${response.status})`);
  return json;
}

export function clearUserLocalCaches(userId) {
  if (!userId) return;
  for (const key of [`wtp_coach_chat_history_${userId}`, `wtp_coach_chat_cache_${userId}`, `wtp_workout_draft_v2_${userId}`]) localStorage.removeItem(key);
}
