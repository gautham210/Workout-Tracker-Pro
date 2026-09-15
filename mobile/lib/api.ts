const HOST_IP = '10.0.2.2'; // Standard Android Emulator host bridge IP
const PORT = '5173';
const BACKEND_URL = `http://${HOST_IP}:${PORT}`;

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
      return await response.json();
    }
  } catch (err) {
    console.warn('[API] Dev server unreachable, triggering local Llama simulation fallback.');
  }

  // Robust fallback simulation if local dev server is offline
  await new Promise(resolve => setTimeout(resolve, 800)); // Natural network latency

  const lastUserMessage = messages[messages.length - 1]?.content || '';
  const query = lastUserMessage.toLowerCase();

  // âââ WORKOUT GENERATION INTENT FALLBACK âââ
  if (query.includes('workout') || query.includes('routine') || query.includes('split') || query.includes('push') || query.includes('pull')) {
    let split = 'Push';
    let exercises = ['Flat Barbell Bench Press', 'Incline Dumbbell Press', 'Dumbbell Lateral Raise', 'Tricep Rope Pushdown'];
    
    if (query.includes('pull')) {
      split = 'Pull';
      exercises = ['Lat Pulldown', 'Barbell Row', 'Bicep Curl', 'Reverse Fly'];
    } else if (query.includes('leg')) {
      split = 'Legs';
      exercises = ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Seated Calf Raise'];
    }

    const text = `Here is your simulated high-intensity ${split} Day routine. Components include ${exercises.join(', ')}.\n\nKeep rest periods strict.`;
    return {
      text,
      intent: 'workout_generation',
      suggestedWorkout: {
        split,
        exercises
      }
    };
  }

  return {
    text: "Simulated response from Coach. I'm currently running in offline mode.",
    intent: 'general'
  };
}