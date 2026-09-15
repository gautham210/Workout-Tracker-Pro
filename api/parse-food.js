/**
 * Vercel Serverless Function: POST /api/parse-food
 *
 * Accepts: { imageUri: string }
 * Returns: structured food analysis JSON
 */

import OpenAI from 'openai';
import { authenticate } from './_auth.js';

const TIMEOUT_LIMIT_MS = 15000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await authenticate(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Malformed payload' });
  }

  const { imageUri } = req.body;
  if (!imageUri || !imageUri.startsWith('data:image')) {
    return res.status(400).json({ error: 'Invalid or missing image payload (must be a base64 data URI)' });
  }

  const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB limit
  if (imageUri.length > MAX_PAYLOAD_SIZE) {
    return res.status(413).json({ error: 'Payload too large. Image must be under 5MB.' });
  }

  const apiKey = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Vision API key is not configured on the server.' });
  }

  try {
    const isNvidia = !!process.env.NVIDIA_API_KEY;
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: isNvidia ? 'https://integrate.api.nvidia.com/v1' : undefined,
    });

    const modelName = isNvidia ? 'meta/llama-3.2-11b-vision-instruct' : 'gpt-4o-mini';

    const systemPrompt = `You are a professional AI nutritionist and food analyzer.
Your task is to estimate the macronutrients and calories of the food in the provided image.
Visual food analysis is inherently uncertain. You MUST identify uncertainty, make explicit assumptions (e.g. "assuming cooked in oil"), and ask ONE high-value follow-up question if a missing detail (like portion size or cooking method) would drastically change the estimate.

You must return the analysis strictly as valid JSON, with NO markdown formatting, NO backticks, and NO explanations outside the JSON.

Schema:
{
  "detectedFoods": ["List of identified items"],
  "caloriesRange": "e.g. '450-600'",
  "proteinRange": "e.g. '30-40'",
  "carbsRange": "e.g. '40-50'",
  "fatRange": "e.g. '15-25'",
  "confidence": "High|Medium|Low",
  "assumptions": ["List of assumptions made"],
  "followUpQuestion": "A single crucial question for the user to refine the estimate (or null if trivial)"
}`;

    const apiCallPromise = client.chat.completions.create({
      model: modelName,
      max_tokens: 512,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            { type: 'image_url', image_url: { url: imageUri } }
          ]
        }
      ],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Vision API request timed out')), TIMEOUT_LIMIT_MS)
    );

    const completion = await Promise.race([apiCallPromise, timeoutPromise]);
    let responseText = completion.choices[0]?.message?.content ?? '';

    // Clean JSON
    responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.warn("Failed to parse JSON, raw text:", responseText);
      return res.status(500).json({ error: 'AI returned an invalid analysis format.' });
    }

    const assumptionsText = data.assumptions && data.assumptions.length > 0 ? `\nAssumptions: ${data.assumptions.join(', ')}` : '';
    const followUp = data.followUpQuestion ? `\n\nQuestion: ${data.followUpQuestion}` : '';
    const formattedResponse = `I detected: ${data.detectedFoods?.join(', ') || 'Unknown food'}.\n\nEstimated Macros:\n- Calories: ${data.caloriesRange} kcal\n- Protein: ${data.proteinRange}g\n- Carbs: ${data.carbsRange}g\n- Fat: ${data.fatRange}g${assumptionsText}${followUp}`;

    return res.status(200).json({ text: formattedResponse, macros: data });
  } catch (err) {
    console.error('[API_PARSE_FOOD] Exception:', err.message);
    const isTimeout = err.message?.includes('timed out');
    return res.status(isTimeout ? 504 : 500).json({ error: 'Failed to analyze food image. Please try again.' });
  }
}
