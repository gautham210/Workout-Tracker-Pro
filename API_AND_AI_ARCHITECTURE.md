# API & AI ARCHITECTURE

## 1. Backend Infrastructure
- **Provider**: Vercel Serverless Functions.
- **Base URL**: `https://workout-tracker-pro.vercel.app` (Production) / `http://10.0.2.2:5173` (Local Dev Emulator).

## 2. API Endpoints

### `POST /api/ai-chat`
- **Purpose**: Handles conversational queries, intent detection, and workout generation.
- **Input**: `{ messages: Array, context: Object, isNutritionist: boolean }`
- **Output**: `{ text: string, intent: string }` + optional markdown-wrapped JSON for workouts.
- **Model**: `meta/llama-3.1-8b-instruct` (NVIDIA API).
- **Fallback**: Local mock/error response if API key missing.

### `POST /api/parse-workout`
- **Purpose**: Parses raw natural language text into structured workout JSON.
- **Input**: `{ rawText: string, exercises?: Array }`
- **Output**: JSON matching database schema for sessions/exercises.
- **Model**: `meta/llama-3.1-8b-instruct` (NVIDIA API).
- **Fallback**: Deep structural regex fallback algorithm executed locally on server if AI fails or times out.

### `POST /api/parse-food`
- **Purpose**: Analyzes food images to estimate macros and calories.
- **Input**: `{ imageUri: string }` (Base64 data URI).
- **Output**: `{ text: string, macros: Object }`
- **Model**: `meta/llama-3.2-11b-vision-instruct` (NVIDIA) or `gpt-4o-mini` (OpenAI).
- **Fallback**: Returns 504 Gateway Timeout or 500 Server Error if vision processing fails.

## 3. AI Data Flow
1. **Mobile Trigger**: User interacts with UI (Coach Chat, Food Camera, Settings Import).
2. **Client Fetch**: `lib/api.ts` constructs payload and sends POST request to Vercel.
3. **Serverless Function**: Verifies payload, constructs System Prompt, calls NVIDIA/OpenAI via `openai` npm package.
4. **Processing**: Server strips markdown, extracts JSON blocks, sanitizes output.
5. **Client Resolution**: Mobile UI updates state, saving relevant parsed data to Supabase.
