/**
 * Vercel Serverless Function: POST /api/ai-chat
 *
 * Accepts: { messages: Array, context: Object }
 * Returns: AI fitness response & optional structured workout suggestions
 */

import OpenAI from 'openai';

const TIMEOUT_LIMIT_MS = 12000; // 12 seconds defensive timeout

export default async function handler(req, res) {
  // 1. Validate Method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Validate Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(400).json({ error: 'Invalid Content-Type. Must be application/json' });
  }

  // 3. Validate Payload Presence
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Malformed payload: Request body must be a valid JSON object' });
  }

  const { messages, context } = req.body;

  // 4. Validate Messages Structure
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid payload: "messages" array is required' });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('[AI_CHAT] NVIDIA_API_KEY is not configured on the server.');
    return res.status(500).json({ error: 'NVIDIA AI API key is not configured on the server' });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    // ── Build Context-Aware System Prompt ────────────────────────────────────
    const formattedContext = context
      ? `
- Active Program/Split: ${context.activeSplit ?? 'None'}
- Consistency (Last 30 Days): ${context.consistency ?? '0'}%
- Recent Training Sessions: ${JSON.stringify(context.recentSessions ?? [])}
- Strongest Lifts (Milestones): ${JSON.stringify(context.strongestLifts ?? [])}
- Bodyweight Trend (Last Logs): ${JSON.stringify(context.bodyweightTrends ?? [])}
- Recovery/Rest Gaps: ${context.recoveryGaps ?? 'None'}`
      : 'No training logs available yet.';

    const systemPrompt = `You are the ultimate AI Gym Coach, a elite conversational fitness assistant.
Your ONLY domain is gym, workouts, training plans, progressive overload, recovery, calories, protein, and fitness.
You must NEVER answer questions outside of this domain (e.g. history, geography, coding, recipes unrelated to high protein/fitness, general chat). If asked about anything outside this domain, politely and concisely refuse to answer (e.g. "As your AI Coach, I can only assist you with gym training, workouts, and nutrition goals. Let's get back to your workout!").

PERSONALIZED USER TRAINING CONTEXT:
${formattedContext}

INSTRUCTIONS FOR SUGGESTING WORKOUT ROUTINES:
If the user asks for a workout suggestion, routine, or training plan, suggest it clearly.
At the very end of your response, you MUST append a structured JSON block inside a "\`\`\`workout-suggested" block. This is critical for the application UI to parse and allow the user to apply the workout.
The JSON block must match this schema exactly:
{
  "split": "Push|Pull|Legs|Upper|Lower|Full Body|Custom",
  "exercises": ["Full Name of Exercise 1", "Full Name of Exercise 2", "Full Name of Exercise 3"]
}

Example ending of response:
Here is a great chest day routine for you:
...
\`\`\`workout-suggested
{
  "split": "Push",
  "exercises": ["Incline DB Press", "Lateral Raise", "Tricep Pushdown"]
}
\`\`\`

Strictly adhere to the domain boundaries. Be analytical, professional, and highly encouraging.`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10), // Keep conversation window compact to avoid token overflow
    ];

    // ── Robust Timeout Handling ──────────────────────────────────────────────
    const apiCallPromise = client.chat.completions.create({
      model: 'meta/llama-3.1-8b-instruct',
      temperature: 0.2,
      max_tokens: 1024,
      messages: chatMessages,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('NVIDIA API request timed out (12s limit)')), TIMEOUT_LIMIT_MS)
    );

    // Race the API call against the timeout limit
    const completion = await Promise.race([apiCallPromise, timeoutPromise]);
    const responseText = completion.choices[0]?.message?.content ?? '';

    return res.status(200).json({ text: responseText });
  } catch (err) {
    console.error('[AI_CHAT] Exception occurred:', err.message);
    const isTimeout = err.message?.includes('timeout') || err.message?.includes('timeout limit');
    const userMessage = 'AI Coach is temporarily overloaded. Try again in a few seconds.';
    return res.status(isTimeout ? 504 : 500).json({ error: userMessage });
  }
}
