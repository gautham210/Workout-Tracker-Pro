import { supabase } from './supabase';

const HOST_IP = '10.0.2.2'; // Standard Android Emulator host bridge IP
const PORT = '5173';
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || (__DEV__ ? `http://${HOST_IP}:${PORT}` : 'https://workout-tracker-pro.vercel.app');

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SuggestionResponse {
  text: string;
  intent: string;
  suggestedWorkout?: any;
}

export const getAuthHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export async function authenticatedPost(path: string, body: unknown) {
  const response = await fetch(`${BACKEND_URL}${path}`, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Server responded with ${response.status}`);
  return data;
}

/**
 * Dispatches conversational prompt questions to NVIDIA Llama-3.1-8b endpoint or local development server.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  context: any,
  isNutritionist: boolean = false
): Promise<SuggestionResponse> {
  try {
    const data = await authenticatedPost('/api/ai-chat', { messages: messages.slice(-12), isNutritionist });
    if (typeof data.text === 'string' && typeof data.intent === 'string') {
      
      // Attempt to extract workout suggestions if they exist in the raw text
      let suggestedWorkout = undefined;
      const workoutMatch = data.text.match(/```workout-suggested\s*([\s\S]*?)\s*```/);
      if (workoutMatch && workoutMatch[1]) {
        try {
          suggestedWorkout = JSON.parse(workoutMatch[1]);
          // Clean the markdown from the text so the UI doesn't show it
          data.text = data.text.replace(/```workout-suggested\s*([\s\S]*?)\s*```/, '').trim();
        } catch (e) {
          console.warn('Failed to parse suggested workout JSON', e);
        }
      }

      return {
        ...data,
        suggestedWorkout
      };
    }
    throw new Error('AI Coach returned an invalid response.');
  } catch (err: any) {
    console.error('[API] AI request failed:', err);
    throw new Error(err.message || 'Failed to communicate with AI Coach endpoint.');
  }
}

export async function parseWorkoutFromText(rawText: string, exercises: any[]): Promise<any> {
  try {
    return await authenticatedPost('/api/parse-workout', { rawText, exercises: exercises.slice(0, 200) });
  } catch (err: any) {
    console.error('[API] Parse request failed:', err);
    throw new Error(err.message || 'Failed to parse workout data.');
  }
}

export async function scanFoodImage(base64Image: string): Promise<any> {
  try {
    return await authenticatedPost('/api/parse-food', { imageUri: base64Image });
  } catch (err: any) {
    console.error('[API] Food scan request failed:', err);
    throw new Error(err.message || 'Failed to analyze food image.');
  }
}
