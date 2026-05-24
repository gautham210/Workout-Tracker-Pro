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

    const systemPrompt = `You are the ultimate AI Gym Coach, an elite conversational fitness assistant.
Your ONLY domain is training splits, workouts, progressive overload protocols, recovery parameters, macronutrients, calories, and athletic training.
You must NEVER answer questions outside of this domain (e.g., coding, general history, recipes unrelated to high-protein macros, non-fitness chat). Refuse general topics politely and concisely: "As your AI Coach, I can only assist you with gym training, workouts, and nutrition goals. Let's get back to your training!"

PERSONALIZED USER TRAINING CONTEXT:
${formattedContext}

INTENT CLASSIFICATION RULES:
You must classify the user request at the very end of your response inside this exact tag:
__INTENT__: [nutrition|workout_generation|exercise_help|recovery|progression|general_fitness|unrelated]
- nutrition: Vegetarian protein, macro limits, foods, diets, meal targets, calories, hydration.
- workout_generation: Requests to suggest a workout routine, generate tomorrow's push/pull/legs session, or build custom training exercises.
- exercise_help: Form tips, exercise explanations, posture guides, safety modifications.
- recovery: Rest days guidelines, muscle soreness, overtraining fatigue, rest sleep.
- progression: Overload schemes, lifting thresholds, breaking strength plateaus.
- general_fitness: Cardio guidelines, conditioning, baseline metrics.
- unrelated: Standard chat, recipes (non-high-protein), unrelated topics.

SMART WORKOUT ROUTINE GENERATION RULES:
If and ONLY if the user explicitly asks to generate a workout plan (intent: workout_generation), output a highly structured, logical routine:
1. Exercise order: compound multi-joint movements first (e.g. Squat, Deadlift, Bench Press) matching their split, followed by assistance lifts and isolation.
2. Structure each exercise inside your conversational text response strictly in this style:
   - Exercise name
   - Target Sets x Rep range (e.g., 3x8-10)
   - Suggested starting weight (informed by their Strongest Lifts milestones context)
   - Brief overload/progression reasoning (e.g., "+2.5kg from your best Chest Press")
3. Append a structured JSON block inside a "\`\`\`workout-suggested" block at the absolute end of the response matching this schema:
   {
     "split": "Push|Pull|Legs|Upper|Lower|Full Body|Custom",
     "exercises": ["Standardized Exercise Name 1", "Standardized Exercise Name 2"]
   }
   Use standard database exercise names.

DO NOT suggest workout cards or generate plan blocks for nutrition, technique, recovery, or unrelated questions. Answer those queries concisely and conversationally in plain text, then append the intent tag.

Strictly end all responses with:
__INTENT__: [intent_name]`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10), // Keep conversation window compact to avoid token overflow
    ];

    // ── Robust Timeout Handling ──────────────────────────────────────────────
    const apiCallPromise = client.chat.completions.create({
      model: 'meta/llama-3.1-8b-instruct',
      temperature: 0.2,
      max_tokens: 512,
      messages: chatMessages,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('NVIDIA API request timed out (12s limit)')), TIMEOUT_LIMIT_MS)
    );

    // Race the API call against the timeout limit
    const completion = await Promise.race([apiCallPromise, timeoutPromise]);
    const responseText = completion.choices[0]?.message?.content ?? '';

    // ── Parse & Extract Intent Server-Side ────────────────────────────────────
    let parsedIntent = 'general_fitness';
    let cleanedResponseText = responseText;

    const intentMatch = responseText.match(/__INTENT__:\s*(\w+)/i);
    if (intentMatch) {
      parsedIntent = intentMatch[1].trim().toLowerCase();
      // Scrub tag and cleanup whitespace
      cleanedResponseText = responseText.replace(/__INTENT__:\s*\w+/i, '').trim();
    }

    return res.status(200).json({ text: cleanedResponseText, intent: parsedIntent });
  } catch (err) {
    console.error('[AI_CHAT] Exception occurred:', err.message);
    const isTimeout = err.message?.includes('timeout') || err.message?.includes('timeout limit');
    const userMessage = 'AI Coach is temporarily overloaded. Try again in a few seconds.';
    return res.status(isTimeout ? 504 : 500).json({ error: userMessage });
  }
}
