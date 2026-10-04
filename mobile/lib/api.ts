import { supabase } from './supabase';
import { BACKEND_URL_VALUE, getConfigError } from './config';

export const BACKEND_URL = BACKEND_URL_VALUE;
const REQUEST_TIMEOUT_MS = 30_000;

export type ApiErrorCode = 'unauthorized' | 'rate_limited' | 'unavailable' | 'timeout' | 'network' | 'config' | 'server';

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  constructor(message: string, status: number, code: ApiErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** True for connectivity failures (no network, DNS, timeouts) as opposed to server rejections. */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof ApiError) return error.code === 'network' || error.code === 'timeout';
  if (error instanceof TypeError) return true;
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return /network request failed|failed to fetch|fetch failed|network error|timed out|internet connection appears to be offline/i.test(message);
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SuggestionResponse {
  text: string;
  intent: string;
  workoutPlan?: {
    title: string;
    notes?: string | null;
    exercises: Array<{ name: string; sets: number; repsMin: number; repsMax: number; rir: number | null; restSeconds: number; notes?: string | null }>;
  } | null;
}

export const getAuthHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new ApiError('Your session has expired. Please sign in again.', 401, 'unauthorized');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

export async function authenticatedPost(path: string, body: unknown) {
  const configError = getConfigError();
  if (!BACKEND_URL || configError) throw new ApiError(configError ?? 'Backend URL is not configured.', 0, 'config');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body), signal: controller.signal });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as { name?: string })?.name === 'AbortError') throw new ApiError('The request timed out. Check your connection and try again.', 0, 'timeout');
    throw new ApiError('You appear to be offline. Check your connection and try again.', 0, 'network');
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const serverMessage = typeof data?.error === 'string' ? data.error : null;
    if (response.status === 401) throw new ApiError('Your session has expired. Please sign in again.', 401, 'unauthorized');
    if (response.status === 429) throw new ApiError('Too many requests. Please wait a moment and try again.', 429, 'rate_limited');
    if (response.status === 503) throw new ApiError('This service is temporarily unavailable. Please try again shortly.', 503, 'unavailable');
    throw new ApiError(serverMessage ?? `Server responded with ${response.status}`, response.status, 'server');
  }
  return data;
}

/** Dispatches conversational prompts to the backend AI endpoint. */
export async function sendChatMessage(
  messages: ChatMessage[],
  _context: unknown,
  isNutritionist: boolean = false
): Promise<SuggestionResponse> {
  try {
    const data = await authenticatedPost('/api/ai-chat', { messages: messages.slice(-12), isNutritionist });
    if (typeof data.text === 'string' && typeof data.intent === 'string') return data as SuggestionResponse;
    throw new Error('AI Coach returned an invalid response.');
  } catch (err: any) {
    console.error('[API] AI request failed:', err);
    if (err instanceof ApiError) throw err;
    throw new Error(err.message || 'Failed to communicate with AI Coach endpoint.');
  }
}

export async function parseWorkoutFromText(rawText: string, exercises: any[]): Promise<any> {
  try {
    return await authenticatedPost('/api/parse-workout', { rawText, exercises: exercises.slice(0, 200) });
  } catch (err: any) {
    console.error('[API] Parse request failed:', err);
    if (err instanceof ApiError) throw err;
    throw new Error(err.message || 'Failed to parse workout data.');
  }
}

export async function scanFoodImage(base64Image: string): Promise<any> {
  try {
    return await authenticatedPost('/api/parse-food', { imageUri: base64Image });
  } catch (err: any) {
    console.error('[API] Food scan request failed:', err);
    if (err instanceof ApiError) throw err;
    throw new Error(err.message || 'Failed to analyze food image.');
  }
}
