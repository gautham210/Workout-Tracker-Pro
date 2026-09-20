/**
 * Consume a shared, user-derived quota through the authenticated Supabase RPC.
 * This is intentionally fail-closed: reverting to an in-memory map would make
 * a serverless deployment appear protected while allowing instance hopping.
 */
export async function consumeRequestQuota(databaseClient, scope) {
  const { data, error } = await databaseClient.rpc('consume_api_rate_limit', { p_scope: scope });
  if (error || !data || typeof data.allowed !== 'boolean' || !Number.isInteger(data.retryAfterSeconds)) {
    return { allowed: false, retryAfterSeconds: 60, unavailable: true };
  }
  return { allowed: data.allowed, retryAfterSeconds: Math.max(1, data.retryAfterSeconds), unavailable: false };
}
