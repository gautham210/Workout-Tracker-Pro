const HOST_IP = '10.0.2.2'; // Standard Android Emulator host bridge IP
const PORT = '5173';
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || (__DEV__ ? `http://${HOST_IP}:${PORT}` : 'https://workout-tracker-pro.vercel.app');

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SuggestionResponse {
  text: string;
  intent: string;
  suggestedWorkout?: any;
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
    const response = await fetch(`${BACKEND_URL}/api/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context, isNutritionist }),
    });

    if (response.ok) {
      const data = await response.json();
      
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
    } else {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${response.status}`);
    }
  } catch (err: any) {
    console.error('[API] AI request failed:', err);
    throw new Error(err.message || 'Failed to communicate with AI Coach endpoint.');
  }
}