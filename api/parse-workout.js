/**
 * Vercel Serverless Function: POST /api/parse-workout
 *
 * Accepts: { text: string, exercises?: string[] }
 * Returns: structured workout JSON from NVIDIA AI
 *
 * The NVIDIA_API_KEY never leaves this function — it is never
 * exposed client-side. The function strictly parses gym data only.
 */

import OpenAI from 'openai';

const MAX_INPUT_CHARS = 12_000;

const SYSTEM_PROMPT = `You are a gym workout parser. Your ONLY job is to parse raw workout logs into structured JSON.
You must NEVER answer questions, give advice, or perform any task other than parsing workout text.
You must ALWAYS return valid JSON matching the schema exactly — no markdown, no explanation, no code fences.

Schema:
{
  "date": "YYYY-MM-DD or null if not found",
  "split": "Push|Pull|Legs|Upper|Lower|Full Body|Chest|Back|Shoulders|Arms|Biceps|Triceps|Custom|Unknown",
  "exercises": [
    {
      "name": "Full exercise name (mapped intelligently based on split context)",
      "confidence": 0.0-1.0,
      "sets": [
        { "weight_kg": number, "reps": number }
      ]
    }
  ],
  "ambiguous": [
    {
      "raw": "original ambiguous term",
      "options": ["Option A", "Option B", "Option C"]
    }
  ]
}

Rules:
1. Use split context to infer ambiguous exercise names.
   - "Curl" + split=Legs → Leg Curl (confidence 0.85)
   - "Curl" + split=Arms or Push or Biceps → Barbell Curl (confidence 0.75)
   - "Curl" with no context → add to ambiguous[]
2. Weight format: if weight is omitted, use 0. If bodyweight exercise (e.g. pull-ups), use 0.
3. Date format: parse natural dates ("March 3", "3/3", "Monday") to YYYY-MM-DD using current year ${new Date().getFullYear()}.
4. Confidence: 1.0 = exact match, 0.8+ = high, 0.6-0.8 = medium, <0.6 = add to ambiguous.
5. Sets in format "60x15" = weight 60kg, reps 15. "x15" or "15" alone = weight 0, reps 15.
6. If an exercise name is ambiguous, add the raw term to "ambiguous" with 3 plausible options, AND still add your best guess to "exercises" with confidence < 0.7.
7. Return ONLY the JSON object. No markdown. No extra text. No code fences.`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS for same-origin Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { text, exercises } = req.body ?? {};

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing required field: text' });
  }

  if (text.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: `Input too long (max ${MAX_INPUT_CHARS} chars)` });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY not configured on server' });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    // Build contextual prompt with available exercise list
    let userContent = `Parse this workout log:\n\n${text}`;
    if (exercises && exercises.length > 0) {
      const sample = exercises.slice(0, 200).join(', ');
      userContent += `\n\nKnown exercises in our database (use exact names when matching):\n${sample}`;
    }

    const completion = await client.chat.completions.create({
      model:       'meta/llama-3.1-70b-instruct',
      temperature: 0.1,
      max_tokens:  2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content ?? '';

    // Strip any accidental markdown code fences
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Validate it's actually JSON
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[PARSE WORKOUT] AI returned non-JSON:', cleaned.slice(0, 500));
      return res.status(422).json({ error: 'AI returned invalid JSON', raw: cleaned.slice(0, 500) });
    }

    // Basic structural validation
    if (!parsed.exercises || !Array.isArray(parsed.exercises)) {
      return res.status(422).json({ error: 'AI response missing exercises array', parsed });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[PARSE WORKOUT] Error:', err.message);
    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}
