/**
 * Vercel Serverless Function: POST /api/parse-workout
 *
 * Accepts: { rawText: string, exercises?: string[] }
 * Returns: structured workout JSON from NVIDIA AI
 *
 * The NVIDIA_API_KEY never leaves this function.
 */

import OpenAI from 'openai';

const MAX_INPUT_CHARS = 12_000;

const SYSTEM_PROMPT = `You are an elite gym workout parser. Your ONLY job is to parse raw, informal workout logs into structured JSON.
You must NEVER answer questions, give training advice, or perform any task other than parsing workout logs.
You must ALWAYS return valid JSON matching the schema exactly — no markdown formatting, no explanations, no code fences.

Schema:
{
  "date": "YYYY-MM-DD or null if not found",
  "split": "Push|Pull|Legs|Upper|Lower|Full Body|Chest|Back|Shoulders|Arms|Biceps|Triceps|Custom|Unknown",
  "exercises": [
    {
      "name": "Full exercise name from known database or standardized form",
      "confidence": 0.0-1.0,
      "sets": [
        { "weight_kg": number, "reps": number }
      ]
    }
  ],
  "ambiguous": [
    {
      "raw": "original ambiguous term in the log",
      "options": ["Known Option A", "Known Option B", "Known Option C"]
    }
  ]
}

Rules:
1. EXERCISE RESOLUTION & CONTEXT INTELLIGENCE:
   - Use the entire session context, split/day context, and neighboring movements to map ambiguous names.
   - Example: If the term is "Curl" or "Curls" and the split/day is "Legs", map it to "Leg Curl" (confidence 0.9).
   - Example: If the term is "Curl" and the split/day is "Pull", "Arms", "Biceps", or surrounded by back exercises, map it to "Bicep Curl" or "Barbell Curl" (confidence 0.85).
   - If you cannot confidently determine the exact exercise (confidence score < 0.85), do NOT silently guess a random movement. Instead, add the raw term to the "ambiguous" list with 3 plausible options from standard training database (e.g., ["Bicep Curl", "Leg Curl", "Hammer Curl"]), AND put your best contextual guess in the "exercises" list with a low confidence score (e.g., 0.5 - 0.7).

2. WEIGHT FORMATTING:
   - If weight is omitted, use 0.
   - For bodyweight movements (e.g., pullups, pushups, dips), use 0.

3. DATE CONVERSION:
   - Parse natural dates ("March 3", "3/3", "Monday") into YYYY-MM-DD format using the current year: ${new Date().getFullYear()}.
   - If no date is found, set it to null.

4. SETS DECODING:
   - Formats like "60x15" or "60 * 15" mean weight_kg = 60, reps = 15.
   - Formats like "x15" or "15" mean weight_kg = 0, reps = 15.

5. RESPONSE OUTPUT:
   - Return ONLY the raw JSON string. Absolutely no markdown backticks, no wrap text, no formatting.`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 1. Validate Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(400).json({ error: 'Invalid Content-Type. Must be application/json' });
  }

  // 2. Validate Malformed Payload
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Malformed payload: Request body is not a valid JSON object' });
  }

  const { rawText, exercises } = req.body;

  // 3. Validate rawText presence and type
  if (rawText === undefined || rawText === null) {
    return res.status(400).json({ error: 'Missing required field: rawText' });
  }

  if (typeof rawText !== 'string') {
    return res.status(400).json({ error: 'Invalid payload: rawText must be a string' });
  }

  // 4. Validate empty input
  if (rawText.trim() === '') {
    return res.status(400).json({ error: 'Empty input: rawText cannot be empty or whitespace only' });
  }

  if (rawText.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: `Input too long (max ${MAX_INPUT_CHARS} characters)` });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('[AI_IMPORT] NVIDIA_API_KEY is not configured.');
    return res.status(500).json({ error: 'NVIDIA_API_KEY not configured on server' });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    // Provide first 200 exercises as context to help with exact naming
    let userContent = `Parse this raw workout log:\n\n${rawText}`;
    if (exercises && Array.isArray(exercises) && exercises.length > 0) {
      const sample = exercises.slice(0, 200).join(', ');
      userContent += `\n\nKnown exercises database names (prioritize matching these exactly if applicable):\n${sample}`;
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

    // Strip accidental code fences
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Verify raw output is actually JSON
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[AI_IMPORT] AI response was invalid JSON:', cleaned.slice(0, 500));
      return res.status(422).json({ error: 'AI returned invalid JSON', raw: cleaned.slice(0, 500) });
    }

    if (!parsed.exercises || !Array.isArray(parsed.exercises)) {
      return res.status(422).json({ error: 'AI response is missing the exercises array structure', parsed });
    }

    console.log(`[AI_IMPORT] Workout parsed successfully. Exercises found: ${parsed.exercises.length}, Ambiguities found: ${parsed.ambiguous?.length ?? 0}`);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[AI_IMPORT] Error during parsing:', err.message);
    return res.status(500).json({ error: err.message ?? 'Internal server error during parsing' });
  }
}
