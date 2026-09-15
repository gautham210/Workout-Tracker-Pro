/**
 * Vercel Serverless Function: POST /api/parse-workout
 *
 * Accepts: { rawText: string, exercises?: string[] }
 * Returns: structured workout JSON from NVIDIA AI or local regex fallback
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
   - Map aliases standardly based on split/day:
     - "Flat db" -> "Flat Dumbbell Press" (confidence 1.0)
     - "Latpulldown steelwide" -> "Wide Grip Lat Pulldown" (confidence 1.0)
     - "Curls" on legs day -> "Leg Curl" (confidence 1.0)
     - "Fly" on push or chest day -> "Chest Fly" (confidence 1.0)
     - "Dumbell overhead" -> "Overhead Tricep Extension" (confidence 1.0)
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

// ── Preprocessing Normalization ──────────────────────────────────────────────
function normalizeWorkoutText(raw) {
  if (!raw) return '';
  
  let cleaned = raw;
  
  // Replace smart quotes and weird delimiters
  cleaned = cleaned.replace(/[\u201c\u201d\u2018\u2019]/g, '"');
  cleaned = cleaned.replace(/[—–]/g, '-');
  cleaned = cleaned.replace(/[,;]/g, ' ');
  
  // Normalize kg variations: "50kg", "50 kg", "50kgs", "50 KGs" to "50kg"
  cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*(?:kgs?|kg|KGS?|KG)\b/g, '$1kg');
  
  // Normalize reps notation: "x 3", "X3" to " x3"
  cleaned = cleaned.replace(/\s*[xX]\s*(\d+)\b/g, ' x$1');
  
  // Clean up spacing
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  
  // Normalize duplicate newlines
  cleaned = cleaned.replace(/\n\s*\n\s*/g, '\n\n');
  
  // Remove empty lines at start/end
  cleaned = cleaned.trim();
  
  return cleaned;
}

// ── Hard Noise Filtering Guard ──────────────────────────────────────────────
function isLikelyExerciseName(name) {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim().toLowerCase();
  
  if (clean.length < 3) return false;
  
  // 1. Blacklist exact words or patterns
  const blacklist = new Set([
    'mid', 'close', 'normal', 'standing', 'seated', 'flat', 'incline', 'decline',
    'legs', 'push', 'pull', 'arms', 'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'day', 'workout', 'session', 'date', 'split', 'week', 'warmup', 'warm-up',
    'heavy', 'light', 'max', 'failure', 'drop', 'dropset', 'set', 'sets', 'reps',
    'cardio', 'weight', 'weights', 'kg', 'lbs', 'lbs.', 'amrap'
  ]);
  
  if (blacklist.has(clean)) return false;
  
  // 2. Reject pure numeric or pure weight/rep structures (e.g. "10kg 10kg 15kg", "20 incline", "10 10 12")
  const numericWeightNoiseRegex = /^[0-9\s.,kglbsx*+\/-]+$/i;
  if (numericWeightNoiseRegex.test(clean)) return false;
  
  // Check if it starts with a number followed only by a few noise words (e.g., "20 incline", "30 flat")
  const numThenModifierRegex = /^\d+\s*(?:incline|decline|flat|seated|standing|heavy|light|kg|lbs|lbs.)?$/i;
  if (numThenModifierRegex.test(clean)) return false;

  // 3. Blacklist of patterns (e.g. "pull day 5", "day 3")
  if (/\b(?:day|workout|session|split|week)\s*\d+/i.test(clean)) return false;
  if (/\d+\s*(?:day|workout|session|split|week)/i.test(clean)) return false;

  // 4. Token list analysis
  const tokens = clean.split(/[\s_\-\/]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  
  // If it's a single word (single token), it MUST be a recognized exercise keyword or derivative.
  const exerciseKeywords = new Set([
    'press', 'bench', 'fly', 'flys', 'curl', 'curls', 'squat', 'squats', 'deadlift', 'deadlifts',
    'row', 'rows', 'pulldown', 'pulldowns', 'raise', 'raises', 'extension', 'extensions', 'pushdown', 'pushdowns',
    'dip', 'dips', 'pullup', 'pullups', 'pushup', 'pushups', 'chinup', 'chinups', 'lunge', 'lunges',
    'presses', 'shrug', 'shrugs', 'crunch', 'crunches', 'plank', 'planks', 'run', 'cardio', 'walk', 'cycle',
    'crossover', 'covers', 'facepull', 'facepulls', 'pec', 'deck', 'cable', 'barbell', 'dumbbell', 'db', 'bb',
    'lateral', 'front', 'rear', 'overhead', 'skullcrusher', 'skullcrushers', 'clean', 'jerk', 'snatch'
  ]);
  
  if (tokens.length === 1) {
    const t = tokens[0];
    const isKnownKeyword = exerciseKeywords.has(t) || 
                           (t.endsWith('s') && exerciseKeywords.has(t.slice(0, -1))) ||
                           (t.endsWith('es') && exerciseKeywords.has(t.slice(0, -2)));
    if (!isKnownKeyword) {
      return false;
    }
  }
  
  // 5. Ensure it contains at least one non-noise token
  const noiseAdjectives = new Set([
    'max', 'incline', 'no', 'weight', 'heavy', 'light', 'set', 'sets', 'rep', 'reps', 'kg', 'lbs'
  ]);
  const nonNoiseTokens = tokens.filter(t => !noiseAdjectives.has(t) && !blacklist.has(t));
  if (nonNoiseTokens.length === 0) return false;

  return true;
}

// ── Grouped Weight Progression Helper ─────────────────────────────────────────
function parseNumericList(line) {
  if (!line || typeof line !== 'string') return null;
  // Replace typical unit text with spaces
  const clean = line.replace(/(?:kg|lbs|kgs|reps|x)\b/ig, ' ').trim();
  // Split by spaces, commas, or slashes
  const tokens = clean.split(/[\s,\/]+/).filter(Boolean);
  if (tokens.length < 2) return null; // Must contain at least two entries to constitute a list
  
  const nums = [];
  for (const t of tokens) {
    const n = parseFloat(t);
    if (isNaN(n)) return null;
    nums.push(n);
  }
  return nums;
}

// ── Fuzzy Exercise Alias Resolution Mapping ──────────────────────────────────
function applyFuzzyExerciseResolution(exercises, split) {
  const normalizedSplit = (split || '').toLowerCase().trim();
  
  return exercises.map(ex => {
    let name = ex.name || '';
    let confidence = ex.confidence ?? 1.0;
    const cleanName = name.toLowerCase().trim();
    
    if (cleanName === 'flat db' || cleanName === 'flat db press') {
      name = 'Flat Dumbbell Press';
      confidence = 1.0;
    } else if (cleanName === 'latpulldown steelwide' || cleanName === 'lat pulldown steelwide') {
      name = 'Wide Grip Lat Pulldown';
      confidence = 1.0;
    } else if (cleanName === 'dumbell overhead' || cleanName === 'dumbbell overhead') {
      name = 'Overhead Tricep Extension';
      confidence = 1.0;
    } else if (cleanName === 'curls' || cleanName === 'curl') {
      if (normalizedSplit.includes('legs') || normalizedSplit.includes('lower')) {
        name = 'Leg Curl';
        confidence = 1.0;
      } else if (normalizedSplit.includes('pull') || normalizedSplit.includes('arms') || normalizedSplit.includes('biceps')) {
        name = 'Bicep Curl';
        confidence = 1.0;
      } else if (normalizedSplit.includes('push')) {
        name = 'Bicep Curl';
        confidence = 0.5; 
      } else {
        name = 'Bicep Curl';
        confidence = 0.85;
      }
    } else if (cleanName === 'fly' || cleanName === 'flys') {
      if (normalizedSplit.includes('push') || normalizedSplit.includes('chest')) {
        name = 'Chest Fly';
        confidence = 1.0;
      } else if (normalizedSplit.includes('pull') || normalizedSplit.includes('back') || normalizedSplit.includes('shoulders')) {
        name = 'Reverse Fly';
        confidence = 1.0;
      } else {
        name = 'Chest Fly';
        confidence = 0.8;
      }
    } else if (cleanName === 'extension' || cleanName === 'extensions') {
      if (normalizedSplit.includes('legs') || normalizedSplit.includes('lower')) {
        name = 'Leg Extension';
        confidence = 1.0;
      } else if (normalizedSplit.includes('push') || normalizedSplit.includes('arms') || normalizedSplit.includes('triceps')) {
        name = 'Overhead Tricep Extension';
        confidence = 1.0;
      } else {
        name = 'Leg Extension';
        confidence = 0.8;
      }
    } else if (cleanName === 'row' || cleanName === 'rows') {
      if (normalizedSplit.includes('pull') || normalizedSplit.includes('back')) {
        name = 'Seated Cable Row';
        confidence = 1.0;
      } else {
        name = 'Seated Cable Row';
        confidence = 0.8;
      }
    } else if (cleanName === 'standing') {
      if (normalizedSplit.includes('legs') || normalizedSplit.includes('lower')) {
        name = 'Standing Calf Raise';
        confidence = 1.0;
      }
    }
    
    return {
      ...ex,
      name,
      confidence
    };
  });
}

// ── Local Structural Regex Fallback Parser ───────────────────────────────────
function fallbackRegexParser(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const result = {
    date: null,
    split: 'Custom',
    exercises: [],
    ambiguous: []
  };

  const dateRegex = /\b(\d{4}-\d{2}-\d{2})|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\b/i;
  for (const line of lines) {
    const dMatch = line.match(dateRegex);
    if (dMatch) {
      result.date = dMatch[0];
      break;
    }
  }

  const splitRegex = /\b(push|pull|legs|upper|lower|full\s*body|chest|back|shoulders|arms|cardio)\b/i;
  for (const line of lines) {
    const sMatch = line.match(splitRegex);
    if (sMatch) {
      result.split = sMatch[0].charAt(0).toUpperCase() + sMatch[0].slice(1).toLowerCase();
      break;
    }
  }

  let currentExercise = null;
  const setPattern = /^[+-]?\s*(\d+(?:\.\d+)?)\s*(?:kg|lbs|kgs)?\s*[xX*]\s*(\d+)/i;
  const repsOnlyPattern = /^(?:x|reps)?\s*(\d+)\b/i;
  const singleNumPattern = /^[+-]?\s*(\d+(?:\.\d+)?)\s*(kg|lbs|kgs)?$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === result.date || line === result.split) continue;

    // 1. Check if it matches setPattern: e.g. "60x15", "+10kg x8", "3 x 12"
    const setMatch = line.match(setPattern);
    if (setMatch) {
      if (currentExercise) {
        currentExercise.sets.push({
          weight_kg: parseFloat(setMatch[1]),
          reps: parseInt(setMatch[2])
        });
      }
      continue;
    }

    // 2. Check if it matches repsOnlyPattern with "x" prefix: e.g. "x12", "x10"
    if (/^[xX]\s*(\d+)$/.test(line)) {
      const match = line.match(/^[xX]\s*(\d+)$/);
      if (currentExercise && match) {
        currentExercise.sets.push({
          weight_kg: 0,
          reps: parseInt(match[1])
        });
      }
      continue;
    }

    // 3. Check for Grouped Numeric Lists: e.g. "20 20 25" followed by "12 10 8"
    const currentList = parseNumericList(line);
    if (currentList && currentExercise) {
      let nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
      const nextList = nextLine ? parseNumericList(nextLine) : null;
      
      if (nextList && nextList.length === currentList.length) {
        for (let k = 0; k < currentList.length; k++) {
          currentExercise.sets.push({
            weight_kg: currentList[k],
            reps: nextList[k]
          });
        }
        i++; // skip next line
        continue;
      } else {
        for (const num of currentList) {
          currentExercise.sets.push({
            weight_kg: num,
            reps: 10 // default reps
          });
        }
        continue;
      }
    }

    // 4. Check for Single Numbers under an active exercise: e.g. "10kg", "12"
    const singleNumMatch = line.match(singleNumPattern);
    if (singleNumMatch && currentExercise) {
      const val = parseFloat(singleNumMatch[1]);
      const hasUnit = !!singleNumMatch[2];
      
      if (hasUnit || line.startsWith('+') || line.startsWith('-')) {
        currentExercise.sets.push({
          weight_kg: val,
          reps: 10 // default reps
        });
      } else {
        currentExercise.sets.push({
          weight_kg: 0,
          reps: parseInt(singleNumMatch[1])
        });
      }
      continue;
    }

    // 5. Check if it's a valid exercise name candidate
    if (isLikelyExerciseName(line)) {
      currentExercise = {
        name: line,
        confidence: 0.5,
        sets: []
      };
      result.exercises.push(currentExercise);
    }
  }

  result.exercises = result.exercises.filter(ex => ex.sets.length > 0);
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(400).json({ error: 'Invalid Content-Type. Must be application/json' });
  }

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Malformed payload: Request body is not a valid JSON object' });
  }

  const { rawText, exercises } = req.body;

  if (rawText === undefined || rawText === null) {
    return res.status(400).json({ error: 'Missing required field: rawText' });
  }

  if (typeof rawText !== 'string') {
    return res.status(400).json({ error: 'Invalid payload: rawText must be a string' });
  }

  if (rawText.trim() === '') {
    return res.status(400).json({ error: 'Empty input: rawText cannot be empty or whitespace only' });
  }

  if (rawText.length > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: `Input too long (max ${MAX_INPUT_CHARS} characters)` });
  }

  // 1. Preprocessing Normalizer
  const normalizedRaw = normalizeWorkoutText(rawText);

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error('[AI_IMPORT] NVIDIA_API_KEY is not configured on the server. Falling back to local regex parser.');
    const fallbackParsed = fallbackRegexParser(normalizedRaw);
    return res.status(200).json(fallbackParsed);
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    let userContent = `Parse this raw workout log:\n\n${normalizedRaw}`;
    if (exercises && Array.isArray(exercises) && exercises.length > 0) {
      const sample = exercises.slice(0, 200).join(', ');
      userContent += `\n\nKnown exercises database names:\n${sample}`;
    }

    let attempt = 1;
    let parsed = null;
    let systemPromptToUse = SYSTEM_PROMPT;

    while (attempt <= 2) {
      try {
        const completion = await client.chat.completions.create({
          model:       'meta/llama-3.1-8b-instruct',
          temperature: 0.0,
          max_tokens:  1536,
          messages: [
            { role: 'system', content: systemPromptToUse },
            { role: 'user',   content: userContent },
          ],
        });

        const rawContent = completion.choices[0]?.message?.content ?? '';

        const cleaned = rawContent
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        if (cleaned.startsWith('[') || cleaned.startsWith('{')) {
          parsed = JSON.parse(cleaned);
          break;
        }
      } catch (e) {
        console.warn(`[AI_IMPORT] Parse attempt ${attempt} failed:`, e.message);
      }

      systemPromptToUse = SYSTEM_PROMPT + '\n\nCRITICAL: RETURN VALID JSON ONLY! Start with { and end with }. Do not include any explanation or markdown formatting.';
      attempt++;
    }

    // 2. Fallback Safety
    if (!parsed) {
      console.warn('[AI_IMPORT] AI failed to return valid JSON. Resolving via local structural regex parser fallback.');
      parsed = fallbackRegexParser(normalizedRaw);
    }

    // Guardrail Sanitization: Filter out garbage exercises and ambiguities
    if (parsed.exercises && Array.isArray(parsed.exercises)) {
      parsed.exercises = parsed.exercises.filter(ex => isLikelyExerciseName(ex.name));
    }
    if (parsed.ambiguous && Array.isArray(parsed.ambiguous)) {
      parsed.ambiguous = parsed.ambiguous.filter(amb => isLikelyExerciseName(amb.raw));
    }

    // 3. Fuzzy alias resolution mapping
    if (parsed.exercises && Array.isArray(parsed.exercises)) {
      parsed.exercises = applyFuzzyExerciseResolution(parsed.exercises, parsed.split);
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[AI_IMPORT] Severe parser exception, executing regex fallback:', err.message);
    const parsed = fallbackRegexParser(normalizedRaw);
    return res.status(200).json(parsed);
  }
}
