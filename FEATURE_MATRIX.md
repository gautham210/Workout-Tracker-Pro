# FEATURE MATRIX

## Implementation Status Legend
- **REAL**: Fully implemented with real data/APIs.
- **PARTIAL**: Implemented but missing features or relying on local calculation.
- **MOCK**: Faked or simulated. (None currently exist in mobile).
- **NONE**: Not implemented.

## AUTHENTICATION
| Feature | Status | Notes |
|---------|--------|-------|
| Sign Up | REAL | Uses Supabase GoTrue |
| Sign In | REAL | Uses Supabase GoTrue |
| Session Persistence | REAL | Uses AsyncStorage adapter in `lib/supabase.ts` |
| Logout | REAL | Standard Supabase sign-out |
| Profile Data | PARTIAL | Basic auth works, but deep profile management UI is limited |

## DASHBOARD
| Feature | Status | Notes |
|---------|--------|-------|
| Greeting | REAL | Uses authenticated user |
| Next Workout | PARTIAL | Shows UI, but logic for "next" is hardcoded or simplified |
| Statistics | REAL | Derived from real Supabase data |
| Consistency | REAL | Calculated from `workout_sessions` |
| Hydration | PARTIAL | Local UI state only, doesn't persist to DB |

## WORKOUT SYSTEM
| Feature | Status | Notes |
|---------|--------|-------|
| Exercise Catalog | REAL | Fetches from Supabase `exercises` table |
| Workout Creation | REAL | Can build custom workouts |
| Sets/Reps/Weight | REAL | Logged to Supabase `sets` |
| Rest Timer | PARTIAL | UI works, but doesn't persist through backgrounding |
| Workout History | REAL | Saved and fetched accurately |
| Exercise Replacement | NONE | Cannot swap exercises mid-workout |

## ANALYTICS
| Feature | Status | Notes |
|---------|--------|-------|
| Volume/Frequency | REAL | Calculated in `insights.ts` |
| Bodyweight | REAL | Logs to `bodyweight_logs` |
| Charts | PARTIAL | UI visualization is present but basic |

## AI COACH
| Feature | Status | Notes |
|---------|--------|-------|
| Chat & Intent | REAL | Uses `/api/ai-chat` (Llama 3.1 8B) |
| Workout Generation | REAL | Returns structured JSON |
| Progression Advice | REAL | Context-aware based on user queries |

## AI NUTRITIONIST & FOOD SCANNER
| Feature | Status | Notes |
|---------|--------|-------|
| Nutrition Chat | REAL | Uses `/api/ai-chat` |
| Image Scanner | REAL | Uses `/api/parse-food` (Llama 3.2 11B Vision or GPT-4o-Mini) |
| Calorie/Macro Estimates | REAL | Returned from Vision API |

## AI IMPORT
| Feature | Status | Notes |
|---------|--------|-------|
| Natural Language Import | REAL | Uses `/api/parse-workout` |
| Fallback Parser | REAL | Uses Regex if AI fails |
